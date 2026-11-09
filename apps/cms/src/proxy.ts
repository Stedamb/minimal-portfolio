import { NextResponse, type NextRequest } from 'next/server'

import {
  GRAPHQL_PREFERENCE_MUTATION,
  isAllowedPreferenceKey,
  MAX_PREFERENCE_BODY_BYTES,
} from './plugins/demo-guard/preferences'

// Preference writes bypass collection hooks (Payload upserts them straight into the
// database), so the demo guard can't cover them. Cap their size and key space here.
// Next 16 renamed `middleware` to `proxy`.
const PREFERENCES = /^\/api\/payload-preferences(?:\/([^/]+))?\/?$/

const refuse = (status: number, message: string) => NextResponse.json({ errors: [{ message }] }, { status })

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const write = !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(request.method)
  if (!write) return NextResponse.next()

  if (pathname === '/api/graphql') {
    const body = await request.clone().text()
    return GRAPHQL_PREFERENCE_MUTATION.test(body) ? refuse(403, 'Not allowed.') : NextResponse.next()
  }

  const match = PREFERENCES.exec(pathname)
  if (!match) return NextResponse.next()

  // The admin only ever POSTs `/payload-preferences/:key`; the generic create and
  // update routes of the collection would skip the key check.
  const key = match[1] ? decodeURIComponent(match[1]) : undefined
  if (request.method !== 'POST' || !key) return refuse(403, 'Not allowed.')
  if (!isAllowedPreferenceKey(key)) return refuse(400, 'Unknown preference key.')

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_PREFERENCE_BODY_BYTES) return refuse(413, 'Preference too large.')
  const body = await request.clone().arrayBuffer()
  if (body.byteLength > MAX_PREFERENCE_BODY_BYTES) return refuse(413, 'Preference too large.')
  return NextResponse.next()
}

export const config = { matcher: ['/api/payload-preferences/:path*', '/api/graphql'] }
