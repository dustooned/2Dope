import type { StrokeRecord } from '../core/stroke';
import { canonicalPoints, styledRadius, vectorDabs, vectorReach, UNIT, type VectorStyle } from '../core/vectorstyle';
import { hash01 } from '../core/rng';

// One bounded coverage surface is shared synchronously by every rendering consumer.
let coverage: HTMLCanvasElement | undefined;
const tips = new Map<string,HTMLCanvasElement>();
interface CachedMark { canvas:HTMLCanvasElement; resolution:number; x:number; y:number; points:StrokeRecord['points']; brush:StrokeRecord['brush']; style:StrokeRecord['style']; color:string }
const marks=new Map<StrokeRecord,CachedMark>();
let markPixels=0;
const CACHE_PIXELS=2*1024*1024;
export function clearVectorRenderCache():void {for(const entry of marks.values()){entry.canvas.width=entry.canvas.height=0;}marks.clear();markPixels=0;}

function compositeMark(ctx:CanvasRenderingContext2D,rec:StrokeRecord,c:HTMLCanvasElement,x:number,y:number,resolution:number):void {
  ctx.save();applyVectorClips(ctx,rec);ctx.globalAlpha*=rec.brush.opacity;
  ctx.drawImage(c,x,y,c.width/resolution,c.height/resolution);ctx.restore();
}
function tipFor(s: VectorStyle): HTMLCanvasElement {
  const key=s.tip==='custom'?JSON.stringify(s.mask):s.tip;
  const hit=tips.get(key);
  if(hit) {tips.delete(key);tips.set(key,hit);return hit;}
  const c=document.createElement('canvas');c.width=s.tip==='custom'?s.mask!.width:64;c.height=s.tip==='custom'?s.mask!.height:64;
  const g=c.getContext('2d')!, image=g.createImageData(c.width,c.height);
  for(let y=0;y<c.height;y++) for(let x=0;x<c.width;x++) {
    const i=y*c.width+x, nx=(x+.5)/c.width*2-1, ny=(y+.5)/c.height*2-1;
    let a=0;
    if(s.tip==='custom') a=parseInt(s.mask!.alpha.slice(i*2,i*2+2),16);
    else if(s.tip==='dash') a=Math.abs(nx)<.85 && Math.abs(ny)<.24?255:0;
    else if(nx*nx+ny*ny<1) {
      const noise=hash01(937,i,7);
      a=s.tip==='dry' ? (noise>.55 && Math.sin(x*.8+y*.13)>-.7?255:0) : s.tip==='pencil' ? (noise>.48?Math.round(50+noise*170):0) : 255;
    }
    image.data[i*4+3]=a;
  }
  g.putImageData(image,0,0);
  tips.set(key,c);while(tips.size>16) tips.delete(tips.keys().next().value!);
  return c;
}
type XY=[number,number];
function hull(points:XY[]):XY[] {
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a:XY,b:XY,c:XY)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const lo:XY[]=[],hi:XY[]=[];
  for(const p of points){while(lo.length>1 && cross(lo.at(-2)!,lo.at(-1)!,p)<=0)lo.pop();lo.push(p);}
  for(const p of [...points].reverse()){while(hi.length>1 && cross(hi.at(-2)!,hi.at(-1)!,p)<=0)hi.pop();hi.push(p);}
  return [...lo.slice(0,-1),...hi.slice(0,-1)];
}
function polygon(g:CanvasRenderingContext2D,p:XY[]):void {
  if(!p.length)return;g.moveTo(...p[0]!);for(const q of p.slice(1))g.lineTo(...q);g.closePath();
}

export function drawStyledVector(ctx:CanvasRenderingContext2D,rec:StrokeRecord):void {
  if(!rec.points.length)return;
  const s=rec.style!, pts=canonicalPoints(rec), m=s.matrix ?? UNIT;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const p of rec.points){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
  const margin=vectorReach(rec)+2;
  x0=Math.floor(x0-margin);y0=Math.floor(y0-margin);x1=Math.ceil(x1+margin);y1=Math.ceil(y1+margin);
  const width=x1-x0,height=y1-y0;
  const tr=ctx.getTransform();
  const resolution=Math.min(4,Math.max(1,Math.hypot(tr.a,tr.b),Math.hypot(tr.c,tr.d)),2048/width,2048/height,Math.sqrt(1048576/(width*height)));
  const cached=marks.get(rec);
  if(cached && cached.resolution===resolution && cached.points===rec.points && cached.brush===rec.brush && cached.style===rec.style && cached.color===rec.color) {
    marks.delete(rec);marks.set(rec,cached);compositeMark(ctx,rec,cached.canvas,cached.x,cached.y,resolution);return;
  }
  if(cached){markPixels-=cached.canvas.width*cached.canvas.height;marks.delete(rec);cached.canvas.width=cached.canvas.height=0;}
  coverage ??= document.createElement('canvas');
  const c=coverage;c.width=Math.max(1,Math.ceil(width*resolution));c.height=Math.max(1,Math.ceil(height*resolution));
  const g=c.getContext('2d')!;
  g.setTransform(resolution,0,0,resolution,-x0*resolution,-y0*resolution);g.transform(...m);
  g.fillStyle='#000';
  if(s.mode==='stamp') {
    const tip=tipFor(s);
    for(const dab of vectorDabs(rec)) {
      g.save();g.translate(dab.x,dab.y);g.rotate(dab.angle);g.globalAlpha=Math.max(0,Math.min(1,dab.alpha));
      g.drawImage(tip,-dab.radius,-dab.radius*rec.brush.roundness,dab.radius*2,dab.radius*2*rec.brush.roundness);g.restore();
    }
  } else {
    g.beginPath();let prev:XY[]|null=null;
    for(let i=0;i<pts.length;i++) {
      const p=pts[i]!, a=pts[Math.max(0,i-1)]!, b=pts[Math.min(pts.length-1,i+1)]!;
      const r=styledRadius(rec,p,Math.round((p.u ?? i)*16));
      const angle=s.mode==='flat' ? rec.brush.angle*Math.PI/180+(rec.brush.followDirection?Math.atan2(b.y-a.y,b.x-a.x):0) : 0;
      const nib:XY[]=[];
      const n=s.mode==='flat'?4:20;
      for(let j=0;j<n;j++) {
        const t=2*Math.PI*(j+(s.mode==='flat'?.125:0))/n;
        const x=Math.cos(t)*r,y=Math.sin(t)*r*(s.mode==='flat'?rec.brush.roundness:1);
        nib.push([p.x+x*Math.cos(angle)-y*Math.sin(angle),p.y+x*Math.sin(angle)+y*Math.cos(angle)]);
      }
      polygon(g,nib);if(prev)polygon(g,hull([...prev,...nib]));prev=nib;
    }
    // A single union fill prevents dark seams and opacity build-up at self-crossings.
    g.fill();
  }
  g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-in';g.fillStyle=rec.color;g.fillRect(0,0,c.width,c.height);
  compositeMark(ctx,rec,c,x0,y0,resolution);
  // Only committed/authored records are retained. Pointer previews and library specimens
  // remain transient. Geometry/style edits replace records, so their old pixels cannot leak.
  if(rec.controls) {
    const saved=document.createElement('canvas');saved.width=c.width;saved.height=c.height;saved.getContext('2d')!.drawImage(c,0,0);
    marks.set(rec,{canvas:saved,resolution,x:x0,y:y0,points:rec.points,brush:rec.brush,style:rec.style,color:rec.color});markPixels+=saved.width*saved.height;
    while(markPixels>CACHE_PIXELS || marks.size>16){const key=marks.keys().next().value!,entry=marks.get(key)!;markPixels-=entry.canvas.width*entry.canvas.height;entry.canvas.width=entry.canvas.height=0;marks.delete(key);}
  }
}

export function applyVectorClips(ctx:CanvasRenderingContext2D,rec:StrokeRecord):void {
  for(const clip of rec.clips ?? []) {
    const source=new Path2D();for(let i=0;i<clip.runs.length;i+=3)source.rect(clip.runs[i+1]!,clip.runs[i]!,clip.runs[i+2]!-clip.runs[i+1]!,1);
    const path=new Path2D();path.addPath(source,new DOMMatrix([...clip.matrix]));ctx.clip(path);
  }
}
