import { FEATURED_TAG, LAYOUT_TAG, PORTFOLIO_TAG, localeTag, projectTag } from '@repo/shared/cache-tags';
import type { Locale } from './i18n';
import type { MediaItem } from './mappers';

// Public pages are cached on Vercel's CDN with entity tags. Publishing in the CMS
// deletes the affected tags (see pages/api/revalidate.ts), so maxAge is only the safety net
// for a lost purge call. In dev Astro's cache is a no-op, so nothing here needs a guard.

const MAX_AGE = 3 * 60 * 60;
const SWR = 60;
// Vercel limits the tags on one response. Structural tags come first, media tags fill the rest.
export const MAX_TAGS_PER_PAGE = 100;

/** Tags each page declares. The homepage and the portfolio list use separate list tags. */
export const pageTags = {
  home: (locale: Locale) => [FEATURED_TAG, LAYOUT_TAG, localeTag(locale)],
  portfolio: (locale: Locale) => [PORTFOLIO_TAG, LAYOUT_TAG, localeTag(locale)],
  project: (id: number | string, locale: Locale) => [projectTag(id), LAYOUT_TAG, localeTag(locale)],
  info: (locale: Locale) => [LAYOUT_TAG, localeTag(locale)],
};

export interface PageCache {
  set(options: { maxAge?: number; swr?: number; tags?: string[] }): void;
}

export function cachePage(cache: PageCache, tags: string[], mediaTags: string[] = []) {
  const unique = [...new Set([...tags, ...mediaTags])].slice(0, MAX_TAGS_PER_PAGE);
  cache.set({ maxAge: MAX_AGE, swr: SWR, tags: unique });
}

/** Media tags of the items a page shows, so replacing an image or video purges that page. */
export const mediaTagsOf = (items: (MediaItem | undefined)[]): string[] => items.flatMap((item) => item?.tags ?? []);
