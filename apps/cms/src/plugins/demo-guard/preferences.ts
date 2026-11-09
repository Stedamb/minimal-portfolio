// What the admin writes to `payload-preferences`. Those writes go straight to the
// database (no hooks), so the proxy is the only place that can bound them.
// No imports: the proxy must stay light.

export const MAX_PREFERENCE_BODY_BYTES = 16 * 1024

// Collections and globals the admin stores list, document and folder preferences for.
// A test checks every non-system slug of the config is listed here, so a new
// collection (forms, MCP keys, ...) can't be left out silently.
export const PREFERENCE_SLUGS = ['users', 'projects', 'images', 'videos', 'profile', 'forms', 'form-submissions', 'payload-mcp-api-keys'] as const

const slug = `(?:${PREFERENCE_SLUGS.join('|')})`

// Keys written by @payloadcms/ui and @payloadcms/next 3.93: the nav state, the
// locale, the dashboard and folder views, `collection-<slug>` (list columns, live
// preview), `collection-<slug>-<id>` and `global-<slug>` (tabs, collapsibles).
const ALLOWED_KEY = new RegExp(
  `^(?:nav|locale|dashboard-layout|browse-by-folder|collection-${slug}(?:-\\d{1,12})?|global-${slug}|${slug}-collection-folder)$`,
)

export const isAllowedPreferenceKey = (key: string): boolean => ALLOWED_KEY.test(key)

// GraphQL exposes the preferences collection too, and its mutations skip the cap.
export const GRAPHQL_PREFERENCE_MUTATION = /(?:create|update|delete|duplicate)PayloadPreference/
