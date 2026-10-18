/**
 * Arrow buttons at the ends of a bar that scrolls sideways. They show only when there is more to
 * see that way: tap one to move the bar along, hold it to keep going. Swiping the bar still works.
 * The arrows stay in place while the bar's buttons are rebuilt.
 */
export function scrollArrows(bar: HTMLElement): void {
  const arrow = (dir: -1 | 1) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `scroll-arrow ${dir < 0 ? 'left' : 'right'}`;
    b.setAttribute('aria-label', dir < 0 ? 'Scroll back' : 'Scroll for more');
    b.title = dir < 0 ? 'More this way (hold to keep going)' : 'More this way (hold to keep going)';
    b.textContent = dir < 0 ? '‹' : '›';
    b.tabIndex = -1;
    b.hidden = true;
    let wait = 0, run = 0;
    const stop = () => { clearTimeout(wait); clearInterval(run); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bar.scrollBy({ left: dir * Math.max(90, bar.clientWidth * 0.6), behavior: 'smooth' });
      stop();
      wait = window.setTimeout(() => { run = window.setInterval(() => bar.scrollBy({ left: dir * 18 }), 30); }, 380);
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('pointerleave', stop);
    b.addEventListener('click', (e) => e.stopPropagation());
    return b;
  };
  const left = arrow(-1);
  const right = arrow(1);
  const update = () => {
    const over = bar.scrollWidth > bar.clientWidth + 4;
    left.hidden = !over || bar.scrollLeft <= 2;
    right.hidden = !over || bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 2;
  };
  const place = () => {
    if (bar.firstElementChild !== left) bar.prepend(left);
    if (bar.lastElementChild !== right) bar.append(right);
    requestAnimationFrame(update);
    setTimeout(update, 60);
  };
  new MutationObserver(place).observe(bar, { childList: true });
  bar.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(bar);
  place();
}
