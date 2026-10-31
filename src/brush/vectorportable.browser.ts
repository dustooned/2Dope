import { parseProjectFile } from '../io/schema';
import { drawVectorStroke } from './vector';
import { loadBrushes } from '../io/brushstore';
// This fixture loads on localhost, separate from the parent's 127.0.0.1 storage origin.
addEventListener('message',async(e:MessageEvent)=>{
  if(e.source!==parent || e.data?.kind!=='portable-vector')return;
  try {
    const file=parseProjectFile(e.data.text), rec=Object.values(file.drawings).flatMap(d=>d.vectors)[0]!;
    localStorage.setItem('2dope.pen',JSON.stringify({version:1,firmness:1,threshold:.3,full:.6,tilt:false}));
    const c=document.createElement('canvas');c.width=file.canvas.width;c.height=file.canvas.height;drawVectorStroke(c.getContext('2d')!,rec);
    parent.postMessage({kind:'portable-vector-result',url:c.toDataURL(),noLibrary:!(await loadBrushes())?.length},e.origin);
  }catch(error){parent.postMessage({kind:'portable-vector-result',error:String(error)},e.origin);}
});
