// Click toggles the homepage hero video. State is read from the element: the lazy-video
// observer also plays/pauses it on scroll. Idempotent, so a swap can call it again. Bound
// elements are tracked here, not in a DOM attribute: a live-preview morph strips attributes.

const bound = new WeakSet<HTMLElement>();

export function initHeroVideo() {
  const video = document.querySelector<HTMLVideoElement>('video[data-hero-video]');
  if (!video || bound.has(video)) return;
  bound.add(video);
  video.addEventListener('click', () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });
}
