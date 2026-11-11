import { videoFramesReady } from '../view/videoframes';
import { soundReady } from '../view/effects';
import { captionFontsReady } from '../view/captionfonts';
import { effectsPad } from '../core/effects';
import { effectCacheBudget, setEffectCacheBudget } from '../view/effects';
import { Project, type Drawing } from '../core/project';
import { compLength, exportComp, frameContent } from '../core/comp';
import { Residency, residentBytes, type AssetSource } from '../core/residency';
import { domPlaneOps } from '../view/planeops';
import { drawComp, releaseScratch } from '../view/composite';
import { captureProject, loadProjectFile, type Settled } from './projectio';
import { stringifyProjectFile } from './schema';
import { exportVideo, type VideoPicture } from './exportvideo';
import { planVideo, VIDEO_LITE_MAX_BYTES, VIDEO_MAX_BYTES, type VideoOptions } from './videoplan';
import { exportGif, planGif } from './exportgif';
import { GIF_DEFAULTS } from './gifpalette';
import { encodePng, makeCanvas } from './codec';
import { sanitizeName } from './exportplan';
import { SoundBank } from './sound';
import { writeZip } from './zip';

export type BundleStep = 'video' | 'poster' | 'gif' | 'project';
export const BUNDLE_STEPS: BundleStep[] = ['video', 'poster', 'gif', 'project'];
export interface BundleOptions { comp?: string; start: number; end: number; poster: number; project: boolean; video: VideoOptions }
export interface BundlePlan { name: string; comp: string; start: number; end: number; poster: number; fps: number; frames: number; width: number; height: number; duration: number; gifEnd: number; gifWidth: number; gifHeight: number; video: VideoOptions; project: boolean; cap: number }
export function planBundle(project: Project, options: BundleOptions, lite: boolean): BundlePlan {
  const comp = options.comp ? project.comps.get(options.comp) : exportComp(project) ?? project.comp, { start, end } = options;
  if (!comp) throw new Error('The selected export shot is no longer available.');
  const scope = { main: comp.id, activeComp: comp.id, comp, comps: project.comps };
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > compLength(comp, project.comps)) throw new Error('Choose a nonempty range inside this shot.');
  if (!Number.isInteger(options.poster)) throw new Error('Invalid poster frame.');
  if (options.video.format !== 'mp4' || options.video.background === 'transparent') throw new Error('The hand-in bundle requires MP4. Use ordinary Share for other video formats.');
  const cap = (lite ? 64 : 256) * 1024 * 1024, v = planVideo(scope, options.video, lite ? VIDEO_LITE_MAX_BYTES : VIDEO_MAX_BYTES, end - start);
  const gifEnd = Math.min(end, start + Math.max(1, Math.floor(comp.fps * 6))), gif = planGif(scope, lite, { start, end: gifEnd });
  return { name: sanitizeName(project.name), comp: comp.id, start, end, poster: Math.max(start, Math.min(end - 1, options.poster)), fps: comp.fps, frames: end - start, width: v.width, height: v.height, duration: (end - start) / comp.fps, gifEnd, gifWidth: gif.width, gifHeight: gif.height, video: v.options, project: options.project, cap };
}
export type BundleWriter = (step: BundleStep, signal: AbortSignal, progress: (done: number, total: number) => void) => Promise<Blob>;
export interface BundleProgress { step: BundleStep | 'zip'; done: number; total: number; completed: BundleStep[] }
const check = (signal: AbortSignal) => { if (signal.aborted) throw new DOMException('Bundle cancelled', 'AbortError'); };
/** Serial coordinator. Completed immutable files survive a failed later step, never a cancellation. */
export class BundleQueue {
  readonly completed = new Map<BundleStep, Blob>();
  private running = false;
  constructor(readonly plan: BundlePlan, private writer: BundleWriter, private reservedBytes = 0) {}
  async run(signal: AbortSignal, progress: (p: BundleProgress) => void): Promise<Blob> {
    if (this.running) throw new Error('A bundle is already being made.'); this.running = true; let stage: BundleStep | 'zip' = 'video';
    try {
      for (const step of BUNDLE_STEPS.filter(s => s !== 'project' || this.plan.project)) {
        check(signal); if (this.completed.has(step)) continue; stage = step;
        progress({ step, done: 0, total: 1, completed: [...this.completed.keys()] });
        const blob = await this.writer(step, signal, (done, total) => progress({ step, done, total, completed: [...this.completed.keys()] })); check(signal);
        if (!blob.size) throw new Error(`The ${step} file is empty.`);
        this.requireSpace([...this.completed.values()].reduce((n, b) => n + b.size, 0) + blob.size);
        this.completed.set(step, blob);
      }
      stage = 'zip'; progress({ step: 'zip', done: 0, total: 1, completed: [...this.completed.keys()] }); const result = await this.archive(false, signal);
      progress({ step: 'zip', done: 1, total: 1, completed: [...this.completed.keys()] }); return result;
    } catch (e) { if (signal.aborted) { this.completed.clear(); throw e; } throw new Error(`${stage === 'zip' ? 'ZIP packaging' : stage[0]!.toUpperCase() + stage.slice(1)} failed: ${(e as Error).message}`); }
    finally { this.running = false; }
  }
  availableBytes(): number { return Math.max(0, Math.floor((this.plan.cap - this.reservedBytes - 65536) / 4) - [...this.completed.values()].reduce((n, b) => n + b.size, 0)); }
  checkAdditional(bytes: number): void { this.requireSpace([...this.completed.values()].reduce((n, b) => n + b.size, 0) + bytes); }
  private requireSpace(bytes: number): void {
    // Retained blobs + arrayBuffer copies + STORE ZIP + final Blob copy + snapshot assets/headroom.
    if (this.reservedBytes + 4 * bytes + 65536 > this.plan.cap) throw new Error('This bundle exceeds the device memory limit. Choose a smaller video, shorten the range, omit the editable project, or save separate Share files.');
  }
  async archive(incomplete: boolean, signal: AbortSignal): Promise<Blob> {
    check(signal); if (incomplete && this.running) throw new Error('Finish or cancel the current bundle step before saving completed files.');
    const expected = BUNDLE_STEPS.filter(s => s !== 'project' || this.plan.project);
    if (!this.completed.size || !incomplete && expected.some(s => !this.completed.has(s))) throw new Error('The bundle is incomplete. Retry the failed step or explicitly save completed files.');
    this.requireSpace([...this.completed.values()].reduce((n, b) => n + b.size, 0));
    const ext = { video: 'mp4', poster: 'png', gif: 'gif', project: '2dope' }, files = [];
    for (const [step, blob] of this.completed) { check(signal); files.push({ name: `${this.plan.name}-${step}.${ext[step]}`, data: new Uint8Array(await blob.arrayBuffer()) }); }
    const manifest = { format: '2dope-hand-in', version: 1, complete: !incomplete, fps: this.plan.fps, range: { start: this.plan.start + 1, end: this.plan.end }, duration: this.plan.duration, posterFrame: this.plan.poster + 1,
      video: { width: this.plan.width, height: this.plan.height }, gif: { start: this.plan.start + 1, end: this.plan.gifEnd, seconds: (this.plan.gifEnd - this.plan.start) / this.plan.fps, width: this.plan.gifWidth, height: this.plan.gifHeight, loop: 'forever', audio: false }, files: files.map(f => f.name), missing: expected.filter(s => !this.completed.has(s)) };
    files.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) }); check(signal);
    await new Promise<void>(r => setTimeout(r, 0)); check(signal); const zip = writeZip(files); check(signal); return new Blob([zip as BlobPart], { type: 'application/zip' });
  }
}

/** Conservative scratch allowance per reachable nesting depth, including padded effect surfaces. */
export function bundleRenderBytes(project: Pick<Project, 'comps' | 'width' | 'height'>, root: string, width: number, height: number): number {
  const depths = new Map<number, number>();
  const walk = (id: string, depth: number, path: Set<string>) => {
    const comp = project.comps.get(id); if (!comp || path.has(id) || depth > 8) throw new Error('This shot has unsupported or cyclic nested artwork.');
    const next = new Set(path); next.add(id); let area = comp.width * comp.height, fx = false;
    for (const l of comp.layers) {
      if (!l.visible || l.guide && !l.guideExport) continue;
      const source = l.kind === 'comp' ? project.comps.get(l.comp) : null, w = source?.width ?? project.width, h = source?.height ?? project.height, pad = effectsPad(l);
      area = Math.max(area, (w + 2 * pad) * (h + 2 * pad)); fx ||= !!l.effects?.some(e => e.on);
      if (l.kind === 'comp') walk(l.comp, depth + 1, next);
    }
    depths.set(depth, Math.max(depths.get(depth) ?? 0, area * 4 * (fx ? 12 : 6)));
  };
  walk(root, 0, new Set()); return [...depths.values()].reduce((n, bytes) => n + bytes, 0) + width * height * 12;
}
export interface BundleSession { queue: BundleQueue; dispose(): void }
/** Freeze metadata and PNGs before making any files. Snapshot residency never touches the editor pool. */
export async function prepareBundle(owner: Project, options: BundleOptions, lite: boolean, budget: number, source: AssetSource, signal: AbortSignal): Promise<BundleSession> {
  // Sound wave effects need their sound decoded before frames render
  await soundReady();
  await captionFontsReady(owner);
  check(signal); const plan = planBundle(owner, options, lite), scope = plan.comp, currentBytes = [...owner.drawings.values()].reduce((n, d) => n + residentBytes(d), 0);
  const initialScratch = bundleRenderBytes(owner, plan.comp, plan.width, plan.height), audioBytes = [...owner.sounds.values()].reduce((n, s) => n + s.duration * 48000 * 8, 0);
  const captureLimit = Math.min(plan.cap, Math.floor((budget - currentBytes - initialScratch - audioBytes) / 2)) - 65536;
  if (captureLimit < 1) throw new Error('There is not enough render memory for this bundle. Reduce the canvas or effects, or export separate files.');
  const captured = await captureProject(owner, { mode: 'archive', source, maxAssetBytes: captureLimit }).settle(); check(signal);
  const reserved = [...captured.assets.values()].reduce((n, a) => n + a.byteLength, 0) + new TextEncoder().encode(stringifyProjectFile(captured.file)).byteLength;
  if (reserved + 65536 >= plan.cap) throw new Error('The editable snapshot is too large for a bundle on this device. Use separate Share exports.');
  const project = loadProjectFile(captured.file).project; project.main = project.activeComp = scope;
  const scratch = bundleRenderBytes(project, plan.comp, plan.width, plan.height);
  const audio = [...project.sounds.values()].reduce((n, s) => n + s.duration * 48000 * 8, 0), available = budget - currentBytes - scratch - audio;
  // Staging and decoded frames share the device allowance, rather than adding another budget.
  plan.cap = Math.min(plan.cap, Math.max(0, Math.floor(available / 2)));
  const decodedBudget = available - plan.cap;
  if (reserved + 65536 >= plan.cap) throw new Error('This project snapshot leaves too little memory for a bundle. Use a smaller canvas or separate Share exports.');
  if (decodedBudget < project.width * project.height * 4) throw new Error('There is not enough render memory for this bundle. Use a smaller canvas, reduce effects, or save separate Share files.');
  const hold = new Residency(domPlaneOps, async k => captured.assets.get(k) ?? null, decodedBudget); hold.setProject(project);
  const pins = new Map<string, number>(); let pinnedBytes = 0, disposed = false;
  const guarded = {
    async pin(d: Drawing) {
      const count = pins.get(d.id) ?? 0; if (!count) {
        const bytes = project.width * project.height * 4 * (d.parked?.fill || d.fill ? 2 : 1);
        if (pinnedBytes + bytes > decodedBudget) throw new Error('This frame needs more memory than this device can safely use. Reduce the canvas or layer count and try again.'); pinnedBytes += bytes;
      }
      pins.set(d.id, count + 1); await hold.pin(d);
    },
    unpin(d: Drawing) { const count = pins.get(d.id); if (!count) return; if (count === 1) { pins.delete(d.id); pinnedBytes -= project.width * project.height * 4 * (d.parked?.fill || d.fill ? 2 : 1); } else pins.set(d.id, count - 1); hold.unpin(d);
      // Snapshot pixels are immutable and backed by the capture. Release each frame before decoding the next.
      if (count === 1 && d.saved) { d.parked = { rev: d.rev, line: d.saved.line ? { key: d.saved.line, bytes: null } : null, fill: d.saved.fill ? { key: d.saved.fill, bytes: null } : null }; domPlaneOps.resize(d.line, 0, 0); if (d.fill) domPlaneOps.resize(d.fill, 0, 0); }
    },
  };
  const sounds = new SoundBank(() => lite); sounds.source = async k => captured.assets.get(k) ?? null;
  const picture: VideoPicture = { start: plan.start, frames: plan.frames, drawings: f => frameContent(project.comps, plan.comp, plan.start + f).drawings,
    videos: f => frameContent(project.comps, plan.comp, plan.start + f).videos,
    paint(g, f, v) { g.setTransform(v.scale, 0, 0, v.scale, v.x, v.y); drawComp(g, project, plan.comp, plan.start + f, { export: true, backgrounds: true }); } };
  const encode: BundleWriter = async (step, abort, progress) => {
    check(abort); if (disposed) throw new Error('This bundle was closed.');
    if (step === 'video') return (await exportVideo(project, plan.video, p => progress(p.done, p.total), abort, guarded, Math.min(lite ? VIDEO_LITE_MAX_BYTES : VIDEO_MAX_BYTES, queue.availableBytes()), sounds, picture)).blob;
    if (step === 'gif') { const g = planGif(project, lite, { start: plan.start, end: plan.gifEnd }); queue.checkAdditional(Math.ceil(g.width * g.height * g.samples * 1.15 + g.samples * 32 + 800)); return exportGif(project, lite, abort, guarded, progress, false, GIF_DEFAULTS, { start: plan.start, end: plan.gifEnd }); }
    if (step === 'project') { queue.checkAdditional(reserved + 65536); return projectArchive(captured); }
    queue.checkAdditional(Math.ceil(plan.width * plan.height * 4 * 1.02 + 65536));
    const canvas = makeCanvas(plan.width, plan.height), pinned: Drawing[] = [];
    try {
      for (const id of frameContent(project.comps, plan.comp, plan.poster).drawings) { check(abort); const d = project.drawing(id); pinned.push(d); await guarded.pin(d); }
      await videoFramesReady(project, frameContent(project.comps, plan.comp, plan.poster).videos);
      check(abort); const g = canvas.getContext('2d')!, comp = project.comps.get(plan.comp)!; g.scale(plan.width / comp.width, plan.height / comp.height); drawComp(g, project, plan.comp, plan.poster, { export: true, backgrounds: false });
      return new Blob([await encodePng(canvas) as BlobPart], { type: 'image/png' });
    } finally { for (const d of pinned) guarded.unpin(d); canvas.width = canvas.height = 0; releaseScratch(); }
  };
  const writer: BundleWriter = async (step, abort, progress) => {
    const cache = effectCacheBudget; setEffectCacheBudget(0);
    try { return await encode(step, abort, progress); }
    finally { releaseScratch(); setEffectCacheBudget(cache); }
  };
  const queue = new BundleQueue(plan, writer, reserved);
  return { queue, dispose() { if (disposed) return; disposed = true; queue.completed.clear(); captured.assets.clear(); hold.setProject(new Project(1, 1, false)); sounds.use(new Project(1, 1, false)); releaseScratch(); } };
}
function projectArchive(captured: Settled): Blob {
  const files = [{ name: 'project.json', data: new TextEncoder().encode(stringifyProjectFile(captured.file)) }, ...[...captured.assets].map(([name, data]) => ({ name, data }))];
  return new Blob([writeZip(files) as BlobPart], { type: 'application/zip' });
}
