import type { App } from '../app';
import type { AssetClipGesture } from '../core/assettiming';

/** Delegated input on the stable scroll container: rail previews can rebuild underneath capture. */
export class AssetClipDrag {
  private drag: {pointer:number; x:number; scroll:number; cell:number; moved:boolean} | null = null;
  private suppressClick = false;
  constructor(private app: App, private track: HTMLElement, cell: () => number) {
    const finish = (cancel: boolean) => {
      const d = this.drag; this.drag = null; if (!d) return;
      this.suppressClick = d.moved || cancel;
      app.editor.assetClipEnd(cancel || app.workspace !== 'animate' || app.flipbookView);
      if (track.hasPointerCapture(d.pointer)) track.releasePointerCapture(d.pointer);
    };
    window.addEventListener('pointerdown', e => {
      if (this.drag && e.pointerId !== this.drag.pointer) finish(true);
    },true);
    track.addEventListener('pointerdown', e => {
      this.suppressClick = false;
      const control = (e.target as HTMLElement).closest<HTMLElement>('[data-asset-gesture]');
      if (!control || e.button !== 0 || app.workspace !== 'animate' || app.flipbookView || app.strokeActive) return;
      e.stopPropagation();
      const id = control.dataset.assetId!, kind = control.dataset.assetGesture as AssetClipGesture;
      app.setArrangeAssets(true,id);
      this.suppressClick = false;
      this.drag = {pointer:e.pointerId,x:e.clientX,scroll:track.scrollLeft,cell:cell(),moved:false};
      try { track.setPointerCapture(e.pointerId); } catch { /* synthetic events or an interrupted pointer */ }
      if (!app.editor.assetClipStart(id,kind)) finish(true);
    });
    window.addEventListener('pointermove', e => {
      const d = this.drag; if (!d || d.pointer !== e.pointerId) return;
      if (!app.editor.assetClipDragging || app.workspace !== 'animate' || app.flipbookView) { finish(true); return; }
      if (!d.moved && Math.abs(e.clientX-d.x) < 4) return;
      d.moved = true; e.preventDefault();
      const r = track.getBoundingClientRect();
      if (e.clientX > r.right-24) track.scrollLeft += Math.min(d.cell,12);
      else if (e.clientX < r.left+24) track.scrollLeft -= Math.min(d.cell,12);
      app.editor.assetClipMove(Math.round((e.clientX-d.x+track.scrollLeft-d.scroll)/d.cell));
    },{passive:false});
    window.addEventListener('pointerup', e => { if (this.drag?.pointer === e.pointerId) finish(false); });
    window.addEventListener('pointercancel', e => { if (this.drag?.pointer === e.pointerId) finish(true); });
    track.addEventListener('lostpointercapture', e => { if (this.drag?.pointer === e.pointerId) finish(true); });
    window.addEventListener('blur', () => finish(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) finish(true); });
    window.addEventListener('keydown', e => {
      if (!this.drag || e.key !== 'Escape') return;
      e.preventDefault(); e.stopImmediatePropagation(); finish(true);
    },true);
    track.addEventListener('click', e => {
      if (!this.suppressClick) return;
      this.suppressClick = false; e.preventDefault(); e.stopImmediatePropagation();
    },true);
  }
}
