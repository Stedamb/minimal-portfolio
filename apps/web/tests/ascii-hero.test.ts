// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initAsciiHero } from '../src/scripts/ascii-hero';

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = `
    <div data-ascii-hero>
      <canvas></canvas>
      <div data-ascii-fallback hidden><img alt="hero" /></div>
    </div>`;
});

describe('initAsciiHero', () => {
  it('shows the CMS hero media when WebGL is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    initAsciiHero();
    expect(document.querySelector('canvas')).toBeNull();
    expect(document.querySelector<HTMLElement>('[data-ascii-fallback]')!.hidden).toBe(false);
  });

  it('binds a hero only once, so a live-preview swap can call it again', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    initAsciiHero();
    initAsciiHero();
    expect(getContext).toHaveBeenCalledTimes(1);
  });
});
