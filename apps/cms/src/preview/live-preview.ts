import { signPreviewToken } from '@repo/shared/preview-token'
import type { LivePreviewConfig } from 'payload'

// Live preview (KTD7). The admin shows the `web` preview route in an iframe. The URL carries
// an HMAC token for exactly this document (or global) and locale, so `web` never needs the
// admin's cookies. Kept cheap on purpose: Payload calls it on every autosave.

const BREAKPOINTS = [
  { name: 'mobile', label: 'Mobile', width: 375, height: 667 },
  { name: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { name: 'desktop', label: 'Desktop', width: 1440, height: 900 },
]

// Payload's default when `auth.tokenExpiration` is not set. The token must not expire while
// the admin session is still valid, even for a user who never saves, so it uses the same value.
const DEFAULT_SESSION_SECONDS = 7200

const warned = new Set<string>()
const warnOnce = (message: string) => {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(`[live-preview] ${message}`)
}

/** `target` is the path segment after /preview/, or null when there is nothing to preview. */
const livePreview = (target: (data: Record<string, unknown>) => string | null): LivePreviewConfig => ({
  breakpoints: BREAKPOINTS,
  url: async ({ data, locale, payload }) => {
    const secret = process.env.PREVIEW_SECRET
    const webUrl = process.env.WEB_URL
    const path = target(data)
    if (!path) return null
    if (!secret || !webUrl) {
      warnOnce('PREVIEW_SECRET and WEB_URL must both be set, so live preview is turned off.')
      return null
    }
    const users = payload.config.collections.find((collection) => collection.slug === 'users')
    const token = await signPreviewToken({
      secret,
      target: path,
      locale: locale.code,
      ttlSeconds: (users?.auth && users.auth.tokenExpiration) || DEFAULT_SESSION_SECONDS,
    })
    const url = new URL(`/preview/${path}`, webUrl)
    url.searchParams.set('locale', locale.code)
    url.searchParams.set('token', token)
    return url.toString()
  },
})

export const projectLivePreview = livePreview((data) => (data.id ? `projects/${data.id}` : null))
export const profileLivePreview = livePreview(() => 'globals/profile')
