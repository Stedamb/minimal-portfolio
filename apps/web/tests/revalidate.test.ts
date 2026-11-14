import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/revalidate';
import { MAX_TAGS_PER_PAGE, cachePage, pageTags } from '../src/lib/cache';
import { FEATURED_TAG, LAYOUT_TAG, PORTFOLIO_TAG, localeTag, projectTag } from '@repo/shared/cache-tags';

const call = (init: { auth?: string; body?: unknown; raw?: string } = {}) =>
  POST({
    request: new Request('http://localhost:4321/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(init.auth ? { authorization: init.auth } : {}) },
      body: init.raw ?? JSON.stringify(init.body ?? { tags: ['project:1'] }),
    }),
  } as never);

describe('POST /api/revalidate', () => {
  beforeEach(() => {
    process.env.REVALIDATE_SECRET = 'test-secret';
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns 401 without the secret', async () => {
    expect((await call()).status).toBe(401);
  });

  it('returns 401 with a wrong secret', async () => {
    expect((await call({ auth: 'Bearer nope' })).status).toBe(401);
    expect((await call({ auth: 'test-secret' })).status).toBe(401);
  });

  it('returns 401 for every request when no secret is configured', async () => {
    delete process.env.REVALIDATE_SECRET;
    expect((await call({ auth: 'Bearer ' })).status).toBe(401);
    expect((await call({ auth: 'Bearer undefined' })).status).toBe(401);
  });

  it('returns 200 with the purged tags when the secret matches', async () => {
    const response = await call({ auth: 'Bearer test-secret', body: { tags: ['project:1', 'portfolio'] } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tags: ['project:1', 'portfolio'] });
  });

  it('rejects a body that is not a list of tags', async () => {
    expect((await call({ auth: 'Bearer test-secret', body: { tags: 'project:1' } })).status).toBe(400);
    expect((await call({ auth: 'Bearer test-secret', raw: 'not json' })).status).toBe(400);
  });
});

describe('page cache tags', () => {
  it('AE3: the homepage carries only the featured, layout and locale tags', () => {
    expect(pageTags.home('it')).toEqual([FEATURED_TAG, LAYOUT_TAG, localeTag('it')]);
    const tags = pageTags.home('en');
    expect(tags).not.toContain(PORTFOLIO_TAG);
    expect(tags.some((tag) => tag.startsWith('project:'))).toBe(false);
  });

  it('gives the portfolio page its own list tag and no featured tag', () => {
    expect(pageTags.portfolio('it')).toEqual([PORTFOLIO_TAG, LAYOUT_TAG, localeTag('it')]);
  });

  it('tags a project page by id', () => {
    expect(pageTags.project(12, 'en')).toEqual([projectTag(12), LAYOUT_TAG, localeTag('en')]);
  });

  it('sets maxAge as a safety net and keeps the page tags ahead of media tags', () => {
    const set = vi.fn();
    cachePage({ set }, pageTags.home('it'), ['media:images:1']);
    const options = set.mock.calls[0][0];
    expect(options.maxAge).toBeGreaterThan(0);
    expect(options.tags).toEqual([FEATURED_TAG, LAYOUT_TAG, 'locale:it', 'media:images:1']);
  });

  it('caps the tag count so the Vercel tag header stays valid', () => {
    const set = vi.fn();
    const media = Array.from({ length: 500 }, (_, i) => `media:images:${i}`);
    cachePage({ set }, pageTags.home('it'), media);
    expect(set.mock.calls[0][0].tags).toHaveLength(MAX_TAGS_PER_PAGE);
    expect(set.mock.calls[0][0].tags.slice(0, 3)).toEqual(pageTags.home('it'));
  });
});
