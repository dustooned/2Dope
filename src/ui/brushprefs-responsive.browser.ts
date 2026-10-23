export {};
const sizes = { phone: [390, 844], tablet: [1024, 768], landscape: [768, 390] } as const;
const requested = new URLSearchParams(location.search).get('size');
const size = requested === 'tablet' || requested === 'landscape' ? requested : 'phone';
const [width, height] = sizes[size];
const frame = document.createElement('iframe'); frame.width = String(width); frame.height = String(height);
frame.title = `Brush workflow ${width} by ${height}`; frame.src = './brushprefs.html';
document.querySelector('#viewport')!.append(frame);
const deadline = performance.now() + 60000;
const poll = setInterval(() => {
  const doc = frame.contentDocument, summary = doc?.querySelector('#summary')?.textContent ?? '';
  if (/\d+ passed, \d+ failed/.test(summary)) {
    clearInterval(poll); document.querySelector('#summary')!.textContent = summary;
    for (const failure of [...doc!.querySelectorAll('#results li')].filter(e => e.textContent?.startsWith('FAIL'))) document.querySelector('#results')!.append(failure.cloneNode(true));
  } else if (performance.now() > deadline) {
    clearInterval(poll); document.querySelector('#summary')!.textContent = 'Timed out';
  }
}, 200);
