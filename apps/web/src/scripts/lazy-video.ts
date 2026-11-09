// Videos only download and play while at least a quarter of them is on screen.
// Safe to call again after the DOM changed (live preview swaps): observing an element twice is a no-op.

let observer: IntersectionObserver | undefined;

const createObserver = () =>
  new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        const video = target as HTMLVideoElement;
        if (!video.isConnected) {
          observer?.unobserve(video);
        } else if (isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    },
    { threshold: 0.25 },
  );

export function initLazyVideos() {
  observer ??= createObserver();
  document.querySelectorAll<HTMLVideoElement>('video[data-lazy-video]').forEach((video) => observer!.observe(video));
}
