export {};
const requested = new URLSearchParams(location.search).get('size');
const sizes = { phone: [390, 844], small: [320, 568], tablet: [834, 1112], landscape: [844, 390] } as const;
const queue = requested && requested in sizes ? [requested as keyof typeof sizes] : Object.keys(sizes) as (keyof typeof sizes)[];
let totalPassed = 0, totalFailed = 0;
async function run(size: keyof typeof sizes) {
const [width, height] = sizes[size];
const frame = document.createElement('iframe'); frame.width = String(width); frame.height = String(height); frame.title = `Mode workspace ${size}`; frame.src = './workspacelayout.html'; document.querySelector('#viewport')!.replaceChildren(frame);
await new Promise<void>(resolve => {
const deadline = performance.now() + 60000, poll = setInterval(() => {
  const doc = frame.contentDocument, summary = doc?.querySelector('#summary')?.textContent ?? '';
  if (/\d+ passed, \d+ failed/.test(summary)) {
    clearInterval(poll); const counts = /^(\d+) passed, (\d+) failed/.exec(summary)!; totalPassed += Number(counts[1]); totalFailed += Number(counts[2]);
    for (const result of [...doc!.querySelectorAll('#results li')].filter(e => e.textContent?.startsWith('FAIL'))) { const li = document.createElement('li'); li.textContent = `${result.textContent} · ${size}`; document.querySelector('#results')!.append(li); }
    resolve();
  } else if (performance.now() > deadline) { clearInterval(poll); totalFailed++; const li = document.createElement('li'); li.textContent = `FAIL: ${size} timed out`; document.querySelector('#results')!.append(li); resolve(); }
}, 200);
});
}
for (const size of queue) await run(size);
document.querySelector('#summary')!.textContent = `${totalPassed} passed, ${totalFailed} failed · ${queue.join(', ')}`;
