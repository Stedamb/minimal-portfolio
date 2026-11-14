// The live-preview URL: the CMS signs a token for the document (or global) and
// locale that `web` verifies, and the token lives exactly as long as an admin session.
import { verifyPreviewToken } from '@repo/shared/preview-token'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'

let payload: Payload

const SECRET = 'live-preview-test-secret'
const WEB = 'http://web.test:4321'

beforeAll(async () => {
  process.env.PREVIEW_SECRET = SECRET
  process.env.WEB_URL = WEB
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.db.drizzle.execute('DROP SCHEMA IF EXISTS cms_test CASCADE' as never)
  await payload.destroy()
})

type UrlFn = (args: Record<string, unknown>) => Promise<string | null | undefined> | string | null | undefined

const previewUrl = (entity: 'projects' | 'profile', data: Record<string, unknown>, locale = 'en') => {
  const collectionConfig = payload.config.collections.find((c) => c.slug === entity)
  const globalConfig = payload.config.globals.find((g) => g.slug === entity)
  const livePreview = (collectionConfig ?? globalConfig)!.admin.livePreview as unknown as { url: UrlFn; breakpoints: { name: string }[] }
  return {
    livePreview,
    url: livePreview.url({ collectionConfig, globalConfig, data, locale: { code: locale }, payload, req: { payload } }),
  }
}

const parse = (href: string) => {
  const url = new URL(href)
  return { url, token: url.searchParams.get('token'), locale: url.searchParams.get('locale') }
}

describe('live preview url', () => {
  it('points a project at its preview route with a token that verifies for that project and locale', async () => {
    const { url: href } = previewUrl('projects', { id: 12 }, 'en')
    const { url, token, locale } = parse((await href)!)
    expect(url.origin).toBe(WEB)
    expect(url.pathname).toBe('/preview/projects/12')
    expect(locale).toBe('en')
    expect(await verifyPreviewToken({ secret: SECRET, token, target: 'projects/12' })).toEqual({ ok: true, locale: 'en' })
    expect((await verifyPreviewToken({ secret: SECRET, token, target: 'projects/13' })).ok).toBe(false)
    expect((await verifyPreviewToken({ secret: SECRET, token, target: 'globals/profile' })).ok).toBe(false)
  })

  it('points the Profile global at its own preview route (the homepage)', async () => {
    const { url: href } = previewUrl('profile', {}, 'it')
    const { url, token } = parse((await href)!)
    expect(url.pathname).toBe('/preview/globals/profile')
    expect(await verifyPreviewToken({ secret: SECRET, token, target: 'globals/profile' })).toEqual({ ok: true, locale: 'it' })
  })

  it('lives exactly as long as the admin session token', async () => {
    const users = payload.config.collections.find((c) => c.slug === 'users')!
    const ttl = users.auth.tokenExpiration
    expect(ttl).toBeGreaterThan(0)
    const { token } = parse((await previewUrl('projects', { id: 1 }).url)!)
    const issued = Date.now()
    const check = (offsetSeconds: number) =>
      verifyPreviewToken({ secret: SECRET, token, target: 'projects/1', now: issued + offsetSeconds * 1000 })
    expect((await check(ttl - 5)).ok).toBe(true)
    expect((await check(ttl + 5)).ok).toBe(false)
  })

  it('offers no preview for a document that is not saved yet', async () => {
    expect(await previewUrl('projects', {}).url).toBeNull()
  })

  it('offers mobile, tablet and desktop breakpoints on both', () => {
    for (const entity of ['projects', 'profile'] as const) {
      expect(previewUrl(entity, { id: 1 }).livePreview.breakpoints.map((b) => b.name)).toEqual(['mobile', 'tablet', 'desktop'])
    }
  })
})
