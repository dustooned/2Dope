import type { Comp, CompLayer } from './comp';
import type { Project } from './project';

/** Placement numbers are local to this source in this shot, independent of other asset tracks. */
export function assetLabel(p: Project, shot: Comp, layer: CompLayer) {
  const source = p.comps.get(layer.comp)?.name ?? 'Missing source';
  const linked = shot.layers.filter(l => l.kind === 'comp' && l.comp === layer.comp);
  const number = Math.max(1,linked.findIndex(l => l.id === layer.id)+1), count = linked.length;
  const placement = `placement ${number}`;
  return {source, number, count,
    picker: `${layer.name}${layer.name === source ? '' : ` (${source})`} · ${placement}`,
    description: `${layer.name}, ${placement} of source ${source}. ${count} linked placement${count === 1 ? '' : 's'} in this shot.`};
}
