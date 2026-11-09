import { isLivePreviewEvent, ready } from '@payloadcms/live-preview';
import { Idiomorph } from 'idiomorph';

// Client side of live preview (KTD7). The admin posts its unsaved form state to this frame;
// the frame debounces it, posts it to its own URL (the preview route merges it through
// Payload and renders the page), then morphs the returned HTML into the page.

// The page regions the views render. Loader, cursor and smooth scroll live outside them and
// keep their own state.
const REGIONS = ['nav', 'header', 'main', 'footer'];
const PAUSED_ATTRIBUTE = 'data-preview-paused';

export interface LivePreviewOptions {
  /** URL of the CMS. Only messages from its origin are accepted. */
  cmsUrl: string;
  /** Re-runs the idempotent page initialisers (lazy video, gallery, marquee, ...) on the new DOM. */
  afterSwap: () => void;
  debounceMs?: number;
  fetchImpl?: typeof fetch;
}

function setPaused(paused: boolean) {
  let marker = document.querySelector<HTMLElement>(`[${PAUSED_ATTRIBUTE}]`);
  if (!paused) return marker?.remove();
  if (marker) return;
  marker = document.createElement('div');
  marker.setAttribute(PAUSED_ATTRIBUTE, '');
  marker.setAttribute('role', 'status');
  marker.textContent = 'Preview paused';
  marker.style.cssText =
    'position:fixed;left:12px;bottom:12px;z-index:9999;padding:4px 10px;font:12px/1.4 system-ui,sans-serif;background:#111;color:#fff;border-radius:4px;opacity:.9';
  document.body.append(marker);
}

function swap(html: string) {
  const next = new DOMParser().parseFromString(html, 'text/html');
  const regionOf = (root: HTMLElement, tag: string) => Array.from(root.children).find((el) => el.tagName.toLowerCase() === tag);
  const { scrollX, scrollY } = window;
  for (const tag of REGIONS) {
    const current = regionOf(document.body, tag);
    const incoming = regionOf(next.body, tag);
    if (current && incoming) Idiomorph.morph(current, incoming, { morphStyle: 'outerHTML' });
  }
  // The page height can change under the reader: keep the scroll position.
  if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
}

/** Starts listening for the admin's messages. Returns a function that stops it. */
export function startLivePreview({ cmsUrl, afterSwap, debounceMs = 200, fetchImpl = (...args) => fetch(...args) }: LivePreviewOptions) {
  const serverURL = new URL(cmsUrl).origin;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const render = async (data: unknown) => {
    controller?.abort();
    const current = (controller = new AbortController());
    try {
      const response = await fetchImpl(window.location.href, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data }),
        signal: current.signal,
      });
      if (!response.ok) throw new Error(`Preview render failed: ${response.status}`);
      const html = await response.text();
      if (current.signal.aborted) return;
      swap(html);
      afterSwap();
      setPaused(false);
    } catch {
      // A newer request superseded this one: nothing to report.
      if (current.signal.aborted) return;
      // Keep the last good render and say so until the next success.
      setPaused(true);
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (!isLivePreviewEvent(event, serverURL)) return;
    const { data } = event.data as { data?: unknown };
    if (!data || typeof data !== 'object') return;
    clearTimeout(timer);
    timer = setTimeout(() => void render(data), debounceMs);
  };

  window.addEventListener('message', onMessage);
  // Tells the admin this frame is ready for the first form state.
  ready({ serverURL });

  return () => {
    window.removeEventListener('message', onMessage);
    clearTimeout(timer);
    controller?.abort();
  };
}
