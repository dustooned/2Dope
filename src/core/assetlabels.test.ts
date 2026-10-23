import { describe, expect, it } from 'vitest';
import { assetLabel } from './assetlabels';
import { compLayer, drawingsLayer, newComp } from './comp';
import type { Project } from './project';
import { assetPreviewKey } from '../view/assetpreview';

function rig() {
  const shot=newComp('shot','Shot',32,16,12),source=newComp('sky','Sky',32,16,12),other=newComp('cloud','Cloud',32,16,12);
  source.asset=other.asset=true;
  source.layers.push(drawingsLayer('paint','Paint',[{drawing:'blue',length:1},{drawing:'later',length:1}],32,16));
  const a=compLayer('a','Sky',source,shot),b=compLayer('b','Sky 2',source,shot);
  shot.layers.push(a,compLayer('x','Cloud',other,shot),b);
  const p={width:32,height:16,comps:new Map([[shot.id,shot],[source.id,source],[other.id,other]]),drawings:new Map([['blue',{rev:1}],['later',{rev:1}]])} as unknown as Project;
  return {p,shot,source,a,b};
}
describe('asset source and placement identity',()=>{
  it('numbers placements per source rather than across unrelated asset tracks',()=>{
    const {p,shot,a,b}=rig();
    expect(assetLabel(p,shot,a)).toMatchObject({number:1,count:2,picker:'Sky · placement 1'});
    expect(assetLabel(p,shot,b)).toMatchObject({number:2,count:2,picker:'Sky 2 (Sky) · placement 2'});
  });
  it('keeps renamed source identity separate from placement names and handles missing sources',()=>{
    const {p,shot,source,a}=rig();source.name='Sunset';
    expect(assetLabel(p,shot,a).description).toContain('source Sunset');
    expect(assetLabel(p,shot,a).picker).toBe('Sky (Sunset) · placement 1');
    p.comps.delete(source.id);expect(assetLabel(p,shot,a).source).toBe('Missing source');
  });
  it('preview keys change with source pixels and paint settings, not placement timing or transforms',()=>{
    const {p,source,a}=rig(),key=assetPreviewKey(p,source.id);
    a.in=4;a.out=10;a.transform.rotation.value=30;
    expect(assetPreviewKey(p,source.id)).toBe(key);
    p.drawings.get('blue')!.rev++;expect(assetPreviewKey(p,source.id)).not.toBe(key);
    const painted=assetPreviewKey(p,source.id);source.layers[0]!.visible=false;
    expect(assetPreviewKey(p,source.id)).not.toBe(painted);
  });
  it('does not invalidate frame-one artwork for an unrelated later drawing pixel edit',()=>{
    const {p,source}=rig(),key=assetPreviewKey(p,source.id);
    p.drawings.get('later')!.rev++;expect(assetPreviewKey(p,source.id)).toBe(key);
    expect(assetPreviewKey(p,'missing')).toBe('');
  });
});
