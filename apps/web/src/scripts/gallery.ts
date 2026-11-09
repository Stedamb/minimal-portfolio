// Fullscreen gallery for project items. Idempotent: items bind once (marked in the DOM) and the
// Escape listener binds once, so a live-preview swap can call it again for the new items.

const INLINE_CLASSES = ['lazyload', 'h-[200px]', 'lg:h-[400px]', 'cursor-hover', 'cursor-fullscreen'];
const FULLSCREEN_CLASSES = ['fixed', 'inset-0', 'w-screen', 'h-screen', 'bg-text', 'z-50', 'flex', 'items-center', 'justify-center'];

let openItem: HTMLElement | null = null;
let keydownBound = false;

const setFullscreen = (item: HTMLElement, fullscreen: boolean) => {
  item.classList.remove(...(fullscreen ? INLINE_CLASSES : FULLSCREEN_CLASSES));
  item.classList.add(...(fullscreen ? FULLSCREEN_CLASSES : INLINE_CLASSES));
  const video = item.querySelector('video');
  if (video) video.controls = fullscreen;
  // Photos are shown whole in fullscreen instead of cropped to the inline box.
  const photo = item.querySelector('img');
  if (photo) photo.style.objectFit = fullscreen ? 'contain' : '';
  item.querySelector('[data-gallery-caption]')?.classList.toggle('hidden', !fullscreen);
  item.querySelector('[data-gallery-close]')?.classList.toggle('hidden', !fullscreen);
  openItem = fullscreen ? item : null;
  document.dispatchEvent(new CustomEvent('scroll-lock', { detail: fullscreen }));
};

export function initGallery() {
  // A swap can remove the open item: give scrolling back.
  if (openItem && !openItem.isConnected) {
    openItem = null;
    document.dispatchEvent(new CustomEvent('scroll-lock', { detail: false }));
  }

  document.querySelectorAll<HTMLElement>('[data-gallery-item]').forEach((item) => {
    if (item.dataset.galleryBound) return;
    item.dataset.galleryBound = 'true';
    item.addEventListener('click', (event) => {
      if ((event.target as Element).closest('[data-gallery-close]')) {
        setFullscreen(item, false);
      } else if (openItem !== item) {
        // While open, clicks belong to the native video controls.
        if (openItem) setFullscreen(openItem, false);
        setFullscreen(item, true);
      }
    });
  });

  if (keydownBound) return;
  keydownBound = true;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openItem) setFullscreen(openItem, false);
  });
}
