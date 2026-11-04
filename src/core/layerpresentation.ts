import { valueAt } from './anim';
import { layerFrame, type Comp, type Layer } from './comp';

/** Shared words and ordering; each workspace keeps its own gestures and row controls. */
export function layerPresentation(layer: Layer, comps: Map<string, Comp>, frame: number, displayedOpacity?: number) {
  const source = layer.kind === 'comp' ? comps.get(layer.comp) : null;
  const kind = layer.kind === 'comp' ? source?.asset ? 'Symbol' : 'Group' : layer.kind === 'camera' ? 'Camera' : layer.kind === 'null' ? 'Anchor'
    : layer.title ? 'Title' : layer.adjust ? 'Adjustment' : layer.notes ? 'Notes' : layer.guide ? 'Board' : layer.still ? 'Still' : layer.exposures.length > 1 ? 'Clip' : 'Drawing';
  const opacity = Math.round(displayedOpacity ?? valueAt(layer.transform.opacity, layerFrame(layer, frame)));
  const badges = [kind, ...(source ? [`Source: ${source.name}`] : []), ...(layer.mask ? ['Mask'] : []), ...(layer.clip ? ['Clipping'] : []), ...(layer.effects?.length ? [`${layer.effects.length} effects`] : []),
    ...(layer.blend !== 'normal' ? [layer.blend] : []), ...(opacity < 100 ? [`${opacity}%`] : []), ...(!layer.visible ? ['Hidden'] : []), ...(layer.locked ? ['Locked'] : [])];
  return { name: layer.name, source: source?.name ?? null, kind, badges, label: `${layer.name} · ${badges.join(' · ')}` };
}
