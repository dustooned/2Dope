const sizes={phone:[390,844],tablet:[834,1112],landscape:[844,390]} as const;
const requested=new URLSearchParams(location.search).get('size'),size=requested==='tablet'||requested==='landscape'?requested:'phone';
const [width,height]=sizes[size],frame=document.createElement('iframe');frame.width=String(width);frame.height=String(height);frame.title=`Vector brushes ${width} × ${height}`;frame.src='./vectorbrushes.html';document.querySelector('#viewport')!.append(frame);
const deadline=performance.now()+60000;
const poll=setInterval(()=>{
  const doc=frame.contentDocument,summary=doc?.querySelector('#summary')?.textContent ?? '';
  if(/\d+ passed, \d+ failed/.test(summary)) {
    clearInterval(poll);document.querySelector('#summary')!.textContent=`${summary} · ${size}`;
    for(const result of [...doc!.querySelectorAll('#results li')].filter(e=>/^(FAIL|Measured):/.test(e.textContent ?? '')))document.querySelector('#results')!.append(result.cloneNode(true));
  }else if(performance.now()>deadline){clearInterval(poll);document.querySelector('#summary')!.textContent='Timed out';}
},200);
