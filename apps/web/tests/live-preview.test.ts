// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLivePreview } from '../src/scripts/live-preview';
import { initGallery } from '../src/scripts/gallery';

const CMS = 'http://localhost:3000';
const PAGE_URL = 'http://localhost:4321/preview/projects/7?token=abc';

const page = (title: string) =>
  `<!doctype html><html><body><nav>nav</nav><main><h3 id="title">${title}</h3></main><footer>foot</footer></body></html>`;

const message = (data: unknown, origin = CMS, type = 'payload-live-preview') =>
  window.dispatchEvent(new MessageEvent('message', { origin, data: { type, data } }));

const respond = (html: string, ok = true) => Promise.resolve(new Response(html, { status: ok ? 200 : 502 }));

let stop: (() => void) | undefined;
// Outside an iframe `window.parent` is the window itself; record what is posted to the admin.
let postMessage: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(PAGE_URL);
  document.body.innerHTML = `<nav>nav</nav><main><h3 id="title">Saved</h3></main><footer>foot</footer>`;
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const start = (fetchImpl: typeof fetch, afterSwap = vi.fn()) => {
  stop = startLivePreview({ cmsUrl: `${CMS}/`, afterSwap, fetchImpl });
  return afterSwap;
};
const title = () => document.querySelector('#title')!.textContent;
const paused = () => document.querySelector('[data-preview-paused]');

describe('live preview client', () => {
  it('tells the admin it is ready, addressed to the CMS origin only', () => {
    start(vi.fn() as never);
    expect(postMessage).toHaveBeenCalledWith({ type: 'payload-live-preview', ready: true }, CMS);
  });

  it('ignores a message that does not come from the CMS origin', async () => {
    const fetchImpl = vi.fn(() => respond(page('Evil')));
    start(fetchImpl as never);
    message({ title: 'x' }, 'https://evil.example');
    message({ title: 'x' }, CMS, 'something-else');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(title()).toBe('Saved');
  });

  it('debounces edits, posts the latest form state to its own URL and morphs the page', async () => {
    const fetchImpl = vi.fn(() => respond(page('Typed')));
    const afterSwap = start(fetchImpl as never);
    message({ title: 'T' });
    message({ title: 'Ty' });
    message({ title: 'Typed' });
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(PAGE_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ data: { title: 'Typed' } });
    expect(title()).toBe('Typed');
    expect(afterSwap).toHaveBeenCalledTimes(1);
  });

  it('aborts the request in flight when a newer edit arrives and shows only the newest render', async () => {
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      signals.push(init.signal!);
      const html = page(`Render ${signals.length}`);
      return new Promise<Response>((resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        setTimeout(() => resolve(new Response(html)), 500);
      });
    });
    start(fetchImpl as never);
    message({ title: 'a' });
    await vi.advanceTimersByTimeAsync(250);
    message({ title: 'b' });
    await vi.advanceTimersByTimeAsync(250);
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(title()).toBe('Render 2');
    expect(paused()).toBeNull();
  });

  it('keeps the last render and shows the paused marker until the next success', async () => {
    let fail = false;
    const fetchImpl = vi.fn(() => (fail ? respond('', false) : respond(page('Good'))));
    start(fetchImpl as never);
    message({ title: 'Good' });
    await vi.advanceTimersByTimeAsync(250);
    expect(title()).toBe('Good');

    fail = true;
    message({ title: 'Bad' });
    await vi.advanceTimersByTimeAsync(250);
    expect(title()).toBe('Good');
    expect(paused()?.textContent).toBe('Preview paused');

    fetchImpl.mockImplementation(() => Promise.reject(new TypeError('network down')));
    message({ title: 'Bad again' });
    await vi.advanceTimersByTimeAsync(250);
    expect(title()).toBe('Good');
    expect(document.querySelectorAll('[data-preview-paused]')).toHaveLength(1);

    fail = false;
    fetchImpl.mockImplementation(() => respond(page('Recovered')));
    message({ title: 'Recovered' });
    await vi.advanceTimersByTimeAsync(250);
    expect(title()).toBe('Recovered');
    expect(paused()).toBeNull();
  });
});

describe('gallery initialiser', () => {
  it('does not bind twice when called again after a swap', () => {
    document.body.innerHTML = `<div data-gallery-item class="lazyload h-[200px]"><button data-gallery-close class="hidden"></button></div>`;
    const item = document.querySelector<HTMLElement>('[data-gallery-item]')!;
    const locks: boolean[] = [];
    document.addEventListener('scroll-lock', (event) => locks.push((event as CustomEvent<boolean>).detail));
    initGallery();
    initGallery();
    item.click();
    expect(locks).toEqual([true]);
    expect(item.classList.contains('fixed')).toBe(true);
  });
});
