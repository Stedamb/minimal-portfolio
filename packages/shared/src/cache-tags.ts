// The cache-tag vocabulary shared by `web` (declares tags on pages) and `cms` (purges them).
// Tags use document ids, not slugs, so a slug change still purges the old URL.
// Tags never contain a comma: Vercel's `Vercel-Cache-Tag` header is comma-separated.

type Id = number | string

export type MediaCollection = 'images' | 'videos'

/** Homepage featured list. Carried by the homepage only. */
export const FEATURED_TAG = 'featured'
/** Portfolio list. Carried by the portfolio page only. */
export const PORTFOLIO_TAG = 'portfolio'
/** Profile and everything in the shared page layout. Carried by every page. */
export const LAYOUT_TAG = 'layout'

export const projectTag = (id: Id) => `project:${id}`
// Images and videos are separate tables, so their ids can collide.
export const mediaTag = (collection: MediaCollection, id: Id) => `media:${collection}:${id}`
export const localeTag = (locale: string) => `locale:${locale}`
