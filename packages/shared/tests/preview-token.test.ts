import { describe, expect, it } from 'vitest'
import { signPreviewToken, verifyPreviewToken } from '../src/preview-token'

const secret = 'test-secret'
const now = 1_700_000_000_000
const sign = (target = 'projects/1', ttlSeconds = 7200, at = now) =>
  signPreviewToken({ secret, target, locale: 'it', ttlSeconds, now: at })

describe('preview token', () => {
  it('verifies for the target it was signed for and returns the locale', async () => {
    const token = await sign('projects/1')
    expect(await verifyPreviewToken({ secret, token, target: 'projects/1', now })).toEqual({ ok: true, locale: 'it' })
  })

  it('does not verify for another document or global', async () => {
    const token = await sign('projects/1')
    expect((await verifyPreviewToken({ secret, token, target: 'projects/2', now })).ok).toBe(false)
    expect((await verifyPreviewToken({ secret, token, target: 'globals/profile', now })).ok).toBe(false)
  })

  it('is valid up to the expiry and rejected after it', async () => {
    const token = await sign('projects/1', 7200)
    const expiry = now + 7200 * 1000
    expect((await verifyPreviewToken({ secret, token, target: 'projects/1', now: expiry - 1000 })).ok).toBe(true)
    expect((await verifyPreviewToken({ secret, token, target: 'projects/1', now: expiry + 1000 })).ok).toBe(false)
  })

  it('rejects a tampered payload, a tampered signature and another secret', async () => {
    const token = await sign('projects/1')
    const [payload, signature] = token.split('.')
    const forged = btoa(JSON.stringify({ t: 'projects/1', l: 'en', e: Math.floor(now / 1000) + 99999 })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    expect((await verifyPreviewToken({ secret, token: `${forged}.${signature}`, target: 'projects/1', now })).ok).toBe(false)
    expect((await verifyPreviewToken({ secret, token: `${payload}.${signature.slice(0, -2)}AA`, target: 'projects/1', now })).ok).toBe(false)
    expect((await verifyPreviewToken({ secret: 'other', token, target: 'projects/1', now })).ok).toBe(false)
  })

  it('rejects malformed input without throwing', async () => {
    for (const token of ['', 'abc', 'a.b.c', '.', '%%%.%%%', undefined, null]) {
      expect((await verifyPreviewToken({ secret, token, target: 'projects/1', now })).ok).toBe(false)
    }
  })

  it('rejects everything when no secret is configured', async () => {
    const token = await sign('projects/1')
    expect((await verifyPreviewToken({ secret: '', token, target: 'projects/1', now })).ok).toBe(false)
    await expect(signPreviewToken({ secret: '', target: 'projects/1', locale: 'it', ttlSeconds: 1 })).rejects.toThrow()
  })
})
