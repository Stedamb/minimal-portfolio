import { NextResponse, type NextRequest } from 'next/server'

import {
  GRAPHQL_PREFERENCE_MUTATION,
  isAllowedPreferenceKey,
  isPerDocumentPreferenceKey,
  MAX_PREFERENCE_BODY_BYTES,
} from './plugins/demo-guard/preferences'

// Preference writes bypass collection hooks (Payload upserts them straight into the
// database), so the demo guard can't cover them. Cap their size and key space here.
// Next 16 renamed `middleware` to `proxy`.
const PREFERENCES = /^\/api\/payload-preferences(?:\/([^/]+))?\/?$/

const refuse = (status: number, message: string) => NextResponse.json({ errors: [{ message }] }, { status })

// The regex must see what graphql-http sees: the decoded query, not the raw body (JSON
// unicode escapes would hide the mutation name).
async function guardGraphql(request: NextRequest) {
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const text = await request.clone().text()
  let queries: string[]
  if (type === 'application/graphql') {
    queries = [text]
  } else if (type === 'application/json' || type === '') {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return refuse(400, 'Invalid GraphQL request.')
    }
    const operations = Array.isArray(parsed) ? parsed : [parsed]
    queries = []
    for (const operation of operations) {
      const query = operation && typeof operation === 'object' ? (operation as { query?: unknown }).query : undefined
      if (typeof query !== 'string') return refuse(400, 'Invalid GraphQL request.')
      queries.push(query)
    }
  } else {
    return refuse(415, 'Unsupported content type.')
  }
  return queries.some((query) => GRAPHQL_PREFERENCE_MUTATION.test(query)) ? refuse(403, 'Not allowed.') : NextResponse.next()
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const write = !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(request.method)
  if (!write) return NextResponse.next()

  if (pathname === '/api/graphql') return guardGraphql(request)

  const match = PREFERENCES.exec(pathname)
  if (!match) return NextResponse.next()

  // The admin only ever POSTs `/payload-preferences/:key`; the generic create and
  // update routes of the collection would skip the key check.
  const key = match[1] ? decodeURIComponent(match[1]) : undefined
  if (request.method !== 'POST' || !key) return refuse(403, 'Not allowed.')
  if (isPerDocumentPreferenceKey(key)) return NextResponse.json({ message: 'Preference not stored.' }, { status: 200 })
  if (!isAllowedPreferenceKey(key)) return refuse(400, 'Unknown preference key.')

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_PREFERENCE_BODY_BYTES) return refuse(413, 'Preference too large.')
  const body = await request.clone().arrayBuffer()
  if (body.byteLength > MAX_PREFERENCE_BODY_BYTES) return refuse(413, 'Preference too large.')
  return NextResponse.next()
}

export const config = { matcher: ['/api/payload-preferences/:path*', '/api/graphql'] }
