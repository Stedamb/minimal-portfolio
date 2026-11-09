// Preview tokens (KTD7). The CMS signs one when it builds a live-preview URL, and `web`
// verifies it before it ever uses the preview API key. Web Crypto only, so the same file runs
// in Next (cms) and in Astro on Vercel (web). The token is `base64url(payload).base64url(hmac)`
// where the payload names the target (`projects/<id>` or `globals/<slug>`), the locale and an
// expiry in epoch seconds.

export interface PreviewTokenInput {
  secret: string
  /** Same path segment as the preview URL: `projects/12` or `globals/profile`. */
  target: string
  locale: string
}

interface Payload {
  t: string
  l: string
  e: number
}

const encoder = new TextEncoder()

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

const fromBase64Url = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('bad base64url')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])

export async function signPreviewToken({
  secret,
  target,
  locale,
  ttlSeconds,
  now = Date.now(),
}: PreviewTokenInput & { ttlSeconds: number; now?: number }): Promise<string> {
  if (!secret) throw new Error('PREVIEW_SECRET is not set')
  const payload: Payload = { t: target, l: locale, e: Math.floor(now / 1000) + ttlSeconds }
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(body))
  return `${body}.${toBase64Url(new Uint8Array(signature))}`
}

export type PreviewTokenResult = { ok: true; locale: string } | { ok: false }

/** Never throws: anything malformed, expired or for another target is `{ ok: false }`. */
export async function verifyPreviewToken({
  secret,
  token,
  target,
  now = Date.now(),
}: {
  secret: string
  token: string | null | undefined
  target: string
  now?: number
}): Promise<PreviewTokenResult> {
  const rejected = { ok: false } as const
  if (!secret || typeof token !== 'string') return rejected
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return rejected
    const [body, signature] = parts
    // `subtle.verify` compares the MACs in constant time.
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromBase64Url(signature), encoder.encode(body))
    if (!valid) return rejected
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Partial<Payload>
    if (payload.t !== target || typeof payload.l !== 'string' || typeof payload.e !== 'number') return rejected
    if (now >= payload.e * 1000) return rejected
    return { ok: true, locale: payload.l }
  } catch {
    return rejected
  }
}
