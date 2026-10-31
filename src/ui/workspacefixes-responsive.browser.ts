export {};
const requested=new URLSearchParams(location.search).get('size'),size=requested==='tablet'||requested==='landscape'?requested:'phone';
const sizes={phone:[390,844],tablet:[834,1112],landscape:[844,390]} as const,[width,height]=sizes[size];
const frame=document.createElement('iframe');frame.width=String(width);frame.height=String(height);frame.title=`Motion and artwork layers ${size}`;frame.src='./workspacefixes.html';document.querySelector('#viewport')!.append(frame);
const deadline=performance.now()+60000,poll=setInterval(()=>{
  const doc=frame.contentDocument,summary=doc?.querySelector('#summary')?.textContent ?? '';
  if(/\d+ passed, \d+ failed/.test(summary)) {
    clearInterval(poll);document.querySelector('#summary')!.textContent=`${summary} · ${size}`;
    for(const result of [...doc!.querySelectorAll('#results li')].filter(e=>e.textContent?.startsWith('FAIL')))document.querySelector('#results')!.append(result.cloneNode(true));
  } else if(performance.now()>deadline){clearInterval(poll);document.querySelector('#summary')!.textContent='Timed out';}
},200);
