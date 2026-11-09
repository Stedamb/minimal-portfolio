// Click toggles the homepage hero video. State is read from the element: the lazy-video
// observer also plays/pauses it on scroll. Idempotent, so a swap can call it again.

export function initHeroVideo() {
  const video = document.querySelector<HTMLVideoElement>('video[data-hero-video]');
  if (!video || video.dataset.heroBound) return;
  video.dataset.heroBound = 'true';
  video.addEventListener('click', () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });
}
