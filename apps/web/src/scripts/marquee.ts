// The CSS animation shifts the row by exactly one strip width and loops, so the next copy
// lands where the first started. Here we add enough copies to always fill the viewport.
// Idempotent: filling an already full row adds nothing, and the resize listener binds once.

let resizeBound = false;

const fill = (container: HTMLElement) => {
  const strip = container.firstElementChild as HTMLElement | null;
  const stripWidth = strip?.offsetWidth;
  if (!strip || !stripWidth) return;
  const needed = Math.ceil(window.innerWidth / stripWidth) + 1;
  while (container.children.length < needed) {
    const copy = strip.cloneNode(true) as HTMLElement;
    copy.setAttribute('aria-hidden', 'true');
    container.append(copy);
  }
  container.style.setProperty('--strip-width', `${stripWidth}px`);
};

const fillAll = () => document.querySelectorAll<HTMLElement>('[data-marquee]').forEach(fill);

export function initMarquee() {
  // Measure after web fonts load, otherwise the fallback font width is used.
  document.fonts.ready.then(fillAll);

  if (resizeBound) return;
  resizeBound = true;
  let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(fillAll, 200);
  });
}
