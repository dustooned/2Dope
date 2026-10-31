import { cloneBrush, PRESETS } from '../core/brush';
import { strokeLength, type StrokeRecord } from '../core/stroke';
import { DabWalker, dabBounds, type Dab } from './dabs';
import { RasterEngine, drawDab, makeCanvas, type Rect } from './raster';
let passed=0,failed=0;
function check(text:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${text}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
function report(text:string){const li=document.createElement('li');li.textContent=`Measured: ${text}`;document.querySelector('#results')!.append(li);}
function hash(a:Uint8ClampedArray):string{let n=2166136261;for(const b of a)n=Math.imul(n^b,16777619);return (n>>>0).toString(16);}
// Original document-sized grain implementation, kept only for pixel/texture regression checks.
function legacyStamp(engine:RasterEngine):void {
  const scratch=makeCanvas(engine.width,engine.height),s=scratch.getContext('2d')!;
  const internal=engine as unknown as {clip:(b:ReturnType<typeof dabBounds>)=>Rect|null;stamp:(ctx:CanvasRenderingContext2D,d:Dab,tip:HTMLCanvasElement,grain:number,paper:CanvasPattern|null,alphaScale?:number)=>void};
  internal.stamp=(ctx,d,tip,grain,paper,alphaScale=1)=>{
    if(grain<=0 || !paper){drawDab(ctx,d,tip,alphaScale);return;}
    const r=internal.clip(dabBounds(d));if(!r)return;
    s.clearRect(r.x,r.y,r.w,r.h);drawDab(s,d,tip,alphaScale);s.save();s.globalCompositeOperation='destination-out';s.globalAlpha=Math.min(.95,grain)*(1-.25*d.pressure);s.fillStyle=paper;s.fillRect(r.x,r.y,r.w,r.h);s.restore();
    ctx.save();ctx.globalAlpha=1;ctx.drawImage(scratch,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);ctx.restore();
  };
}
try {
  const engine=new RasterEngine(1920,1080);
  for(const [name,size] of [['Pencil',8],['Pencil',128],['Textured Paint',48],['Textured Paint',128],['Ink',10]] as const) {
    const brush=cloneBrush(PRESETS.find(b=>b.name===name)!);brush.size=size;
    const rec:StrokeRecord={id:'perf',tool:'brush',brush,color:'#1e5070',seed:1979,points:Array.from({length:241},(_,i)=>({x:100+i*6.5,y:500+Math.sin(i/14)*210,pressure:.3+.6*Math.sin(i/240*Math.PI),tiltX:20+i/240*50,tiltY:8,t:i*4}))};
    const target=engine.bound;target.getContext('2d')!.clearRect(0,0,1920,1080);engine.begin(rec);
    const walker=new DabWalker(brush,rec.seed),times:number[]=[];let dabs=0;
    for(let i=0;i<rec.points.length;i+=8){const batch=rec.points.slice(i,i+8).flatMap(p=>walker.push(p));dabs+=batch.length;const t=performance.now();engine.addDabs(batch);engine.displaySource();times.push(performance.now()-t);await new Promise(r=>setTimeout(r,0));}
    const t=performance.now(),commit=engine.commit(),duration=performance.now()-t;
    const pixels=target.getContext('2d')!.getImageData(0,0,1920,1080).data,signature=hash(pixels);
    check(`${name} ${size}px makes a finite, undoable stroke`,!!commit && strokeLength(rec.points)>1000 && commit.after.data.some((n,i)=>i%4===3 && n>0));
    report(`${name} ${size}px: ${dabs} dabs; input batches median ${[...times].sort((a,b)=>a-b)[15]!.toFixed(1)}ms, worst ${Math.max(...times).toFixed(1)}ms; commit ${duration.toFixed(1)}ms; pixels ${signature}`);
    {
      const old=new RasterEngine(1920,1080);legacyStamp(old);old.begin(rec);const walk=new DabWalker(brush,rec.seed);old.addDabs(rec.points.flatMap(p=>walk.push(p)));old.commit();
      const before=old.bound.getContext('2d')!.getImageData(0,0,1920,1080).data;let alpha=0,mass=0,error=0,count=0,maxPremul=0;
      for(let i=0;i<before.length;i+=4){alpha=Math.max(alpha,Math.abs(before[i+3]!-pixels[i+3]!));mass+=before[i+3]!;error+=Math.abs(before[i+3]!-pixels[i+3]!);if(before[i+3]||pixels[i+3])count++;for(let c=0;c<3;c++)maxPremul=Math.max(maxPremul,Math.abs(before[i+c]!*before[i+3]!/255-pixels[i+c]!*pixels[i+3]!/255));}
      report(`Reference ${name} ${size}px: old ${hash(before)}, max alpha error ${alpha}, relative alpha error ${(error/Math.max(1,mass)).toFixed(5)}, max premultiplied RGB error ${maxPremul.toFixed(1)}, marked ${count}`);
      check(`${name} ${size}px retains original grain phase, coverage and color within canvas rounding`,alpha<=2 && maxPremul<=2.05 && error/Math.max(1,mass)<.0001);
    }
  }
}catch(error){check(String(error),false);}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed`;
