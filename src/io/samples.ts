/**
 * Sample projects, drawn by code (no bundled files): small, finished examples to open, play and
 * take apart. Each is an ordinary project; opening one adds a copy to the library.
 */

import { drawingsLayer } from '../core/comp';
import { setKey, setSegmentEasing } from '../core/anim';
import { newEffect } from '../core/effects';
import { Project, planeCanvas, type Drawing } from '../core/project';

export type SampleId = 'ball' | 'title';

export const SAMPLES: { id: SampleId; name: string; hint: string }[] = [
  { id: 'ball', name: 'Bouncing ball', hint: 'Frame by frame in Animate: spacing, squash and stretch, on 1s at 12 fps' },
  { id: 'title', name: 'Sliding title', hint: 'One drawing moved in Motion with keyframes, easing and a drop shadow' },
];

const W = 1280, H = 720;

function ink(d: Drawing, draw: (g: CanvasRenderingContext2D) => void, colour: string, fill: string | null): void {
  const line = d.line.getContext('2d')!;
  line.strokeStyle = colour;
  line.lineWidth = 6;
  line.lineJoin = line.lineCap = 'round';
  draw(line);
  line.stroke();
  if (fill) {
    const f = planeCanvas(d, 'fill').getContext('2d')!;
    f.fillStyle = fill;
    draw(f);
    f.fill();
  }
  d.rev++;
}

/** A ball dropping and bouncing: slow at the top, fast at the bottom, squashed on the floor. */
function ball(): Project {
  const p = new Project(W, H);
  p.name = 'Bouncing ball (sample)';
  p.fps = 12;
  const frames = 12, floor = 600, top = 160, r = 48;
  const ex = [];
  for (let i = 0; i < frames; i++) {
    const d = i === 0 ? p.drawing(p.exposures[0]!.drawing)! : p.newDrawing();
    const t = Math.abs(Math.cos((Math.PI * i) / frames)); // 1 at the top, 0 on the floor: eases at the top
    const y = floor - r - (floor - r - top) * t;
    const squash = i === frames / 2 ? 1.35 : t < 0.3 ? 0.85 : 1; // squash on contact, stretch while fast
    const x = 220 + (840 * i) / frames;
    ink(d, (g) => { g.beginPath(); g.ellipse(x, squash > 1 ? floor - r / squash : y, r * squash, r / squash, 0, 0, Math.PI * 2); }, '#1d1d24', '#e63946');
    ex.push({ drawing: d.id, length: 1 });
  }
  p.layer.name = 'Ball';
  p.exposures = ex;
  // the floor on its own layer, held for the whole shot
  const fd = p.newDrawing();
  ink(fd, (g) => { g.beginPath(); g.moveTo(120, floor + 4); g.lineTo(1160, floor + 4); }, '#55555f', null);
  const floorLayer = drawingsLayer(p.newId('L'), 'Floor', [{ drawing: fd.id, length: frames }], W, H);
  p.comp.layers.push(floorLayer);
  return p;
}

/** A drawn badge that slides in with an eased stop, turns a little and settles, with a shadow. */
function title(): Project {
  const p = new Project(W, H);
  p.name = 'Sliding title (sample)';
  p.fps = 24;
  const d = p.drawing(p.exposures[0]!.drawing)!;
  ink(d, (g) => { g.beginPath(); g.roundRect(440, 280, 400, 160, 40); }, '#1d1d24', '#ffcc33');
  ink(d, (g) => { g.beginPath(); g.moveTo(520, 360); g.lineTo(760, 360); g.moveTo(560, 395); g.lineTo(720, 395); }, '#1d1d24', null);
  const l = p.editLayer();
  l.name = 'Badge';
  l.exposures = [{ drawing: d.id, length: 48 }];
  const t = l.transform;
  let pos = setKey(setKey(t.position, 0, [-300, H / 2] as [number, number]), 18, [W / 2, H / 2] as [number, number]);
  pos = setSegmentEasing(pos, 0, 'easeOut');
  t.position = pos;
  t.rotation = setSegmentEasing(setKey(setKey(t.rotation, 0, -12), 24, 0), 0, 'easeInOut');
  t.scale = setSegmentEasing(setKey(setKey(setKey(t.scale, 18, [100, 100] as [number, number]), 24, [112, 112] as [number, number]), 32, [100, 100] as [number, number]), 18, 'easeInOut');
  l.effects = [{ ...newEffect('shadow', 'fx1', 7), amount: 14, size: 10 }];
  return p;
}

export function sampleProject(id: SampleId): Project {
  return id === 'ball' ? ball() : title();
}
