/** One real iframe viewport per page avoids browser-wide emulation and overlapping preferences. */
export {};
const sizes = { phone: [390, 844], tablet: [1024, 768], landscape: [768, 390] } as const;
const requested = new URLSearchParams(location.search).get('size');
const size = requested === 'tablet' || requested === 'landscape' ? requested : 'phone';
let passed = 0, failed = 0;
for (const [width, height] of [sizes[size]]) {
  const frame = document.createElement('iframe'); frame.width = String(width); frame.height = String(height);
  frame.title = `QuickMenu ${width} by ${height}`; frame.src = './quickmenu.html';
  document.querySelector('#viewport')!.replaceChildren(frame);
  const result = await new Promise<{ summary: string; failures: string[] }>(resolve => {
    const deadline = performance.now() + 120000;
    const poll = window.setInterval(() => {
      const doc = frame.contentDocument, summary = doc?.querySelector('#summary')?.textContent ?? '';
      if (/\d+ passed, \d+ failed/.test(summary)) {
        clearInterval(poll); resolve({ summary, failures: [...doc!.querySelectorAll('#results li')].map(e => e.textContent!).filter(t => t.startsWith('FAIL')) });
      } else if (performance.now() > deadline) { clearInterval(poll); resolve({ summary: `${width}×${height}: timed out`, failures: ['Fixture did not finish.'] }); }
    }, 200);
  });
  const row = document.createElement('li'); row.textContent = `${result.summary}${result.failures.length ? `: ${result.failures.join('; ')}` : ''}`; document.querySelector('#results')!.append(row);
  const counts = /^(\d+) passed, (\d+) failed/.exec(result.summary);
  if (counts) { passed += Number(counts[1]); failed += Number(counts[2]); } else failed++;
}
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${size}`;
