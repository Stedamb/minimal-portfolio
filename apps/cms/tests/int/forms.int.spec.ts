// Contact form storage contract: only the site's `submitter`
// key can create submissions, only the owner reads them, and the submitter's one extra
// capability (counting by IP hash) reveals a number and nothing else. REST goes through the
// real Payload route handlers.
import { REST_DELETE, REST_GET, REST_PATCH, REST_POST } from '@payloadcms/next/routes'
import { createHash } from 'node:crypto'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { CONTACT_FORM_SLUG, seedContactForm } from '../../src/seed/contact-form'

const KEYS = { owner: 'forms-owner-key', demo: 'forms-demo-key', submitter: 'forms-submitter-key', preview: 'forms-preview-key' }
const handlers = { GET: REST_GET(config), POST: REST_POST(config), PATCH: REST_PATCH(config), DELETE: REST_DELETE(config) }
const hash = (ip: string) => createHash('sha256').update(ip).digest('hex')

let payload: Payload
let formId: number

async function call(method: keyof typeof handlers, path: string, { key, body }: { key?: string; body?: unknown } = {}) {
  const url = new URL(`http://localhost:3100/api/${path}`)
  const res = await handlers[method](
    new Request(url, {
      method,
      headers: {
        ...(key ? { authorization: `users API-Key ${key}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve({ slug: path.split('?')[0].split('/') }) },
  )
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json, text }
}

const submission = (extra: Record<string, unknown> = {}) => ({
  form: formId,
  submissionData: [
    { field: 'name', value: 'Ada' },
    { field: 'email', value: 'ada@example.com' },
    { field: 'message', value: 'Ciao' },
  ],
  ...extra,
})

const count = async () => (await payload.count({ collection: 'form-submissions', overrideAccess: true })).totalDocs

beforeAll(async () => {
  payload = await getPayload({ config })
  const make = (role: string, key: string) =>
    payload.create({
      collection: 'users',
      data: { email: `${role}-forms@example.com`, password: 'test-password-123', role, enableAPIKey: true, apiKey: key } as never,
      overrideAccess: true,
      context: { assignRole: true },
    })
  await make('owner', KEYS.owner)
  await make('demo', KEYS.demo)
  await make('submitter', KEYS.submitter)
  await make('preview', KEYS.preview)
  await seedContactForm(payload)
  formId = (await payload.find({ collection: 'forms', where: { slug: { equals: CONTACT_FORM_SLUG } }, overrideAccess: true })).docs[0].id
})

afterAll(async () => {
  await payload.db.drizzle.execute('DROP SCHEMA IF EXISTS cms_test CASCADE' as never)
  await payload.destroy()
})

describe('seeded contact form', () => {
  it('is idempotent and localized in Italian and English', async () => {
    await seedContactForm(payload)
    const all = await payload.find({ collection: 'forms', overrideAccess: true })
    expect(all.totalDocs).toBe(1)
    const it = await payload.findByID({ collection: 'forms', id: formId, locale: 'it', overrideAccess: true })
    const en = await payload.findByID({ collection: 'forms', id: formId, locale: 'en', overrideAccess: true })
    expect(it.fields?.map((f) => [f.name, f.blockType, f.label])).toEqual([
      ['name', 'text', 'Nome'],
      ['email', 'email', 'E-mail'],
      ['message', 'textarea', 'Messaggio'],
    ])
    expect(en.fields?.map((f) => f.label)).toEqual(['Name', 'E-mail', 'Message'])
    expect(en.fields?.map((f) => f.id)).toEqual(it.fields?.map((f) => f.id))
    expect(it.confirmationMessage).toBeTruthy()
  })

  it('is readable by anyone, so the site needs no key to render it', async () => {
    const res = await call('GET', `forms?where[slug][equals]=${CONTACT_FORM_SLUG}&locale=en`)
    expect(res.status).toBe(200)
    expect(res.json.docs[0].fields[0].label).toBe('Name')
  })

  it('can be edited only by the owner: the demo is rejected, anonymous too', async () => {
    expect((await call('PATCH', `forms/${formId}`, { key: KEYS.owner, body: { title: 'Contatti!' } })).status).toBe(200)
    expect((await call('PATCH', `forms/${formId}`, { key: KEYS.demo, body: { title: 'x' } })).status).toBeGreaterThanOrEqual(400)
    expect((await call('PATCH', `forms/${formId}`, { body: { title: 'x' } })).status).toBeGreaterThanOrEqual(400)
    expect((await call('DELETE', `forms/${formId}`, { key: KEYS.submitter })).status).toBeGreaterThanOrEqual(400)
  })
})

describe('creating submissions', () => {
  it('rejects an anonymous POST straight to /api/form-submissions and stores nothing', async () => {
    const before = await count()
    const res = await call('POST', 'form-submissions', { body: submission() })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await count()).toBe(before)
  })

  it('rejects a demo create and stores nothing', async () => {
    const before = await count()
    const res = await call('POST', 'form-submissions', { key: KEYS.demo, body: submission() })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await count()).toBe(before)
  })

  it('rejects a preview-key create', async () => {
    const before = await count()
    expect((await call('POST', 'form-submissions', { key: KEYS.preview, body: submission() })).status).toBeGreaterThanOrEqual(400)
    expect(await count()).toBe(before)
  })

  it('accepts the submitter key, stores the IP hash, and does not echo it back', async () => {
    const before = await count()
    const res = await call('POST', 'form-submissions', { key: KEYS.submitter, body: submission({ ipHash: hash('203.0.113.7') }) })
    expect(res.status).toBe(201)
    expect(res.text).not.toContain(hash('203.0.113.7'))
    expect(await count()).toBe(before + 1)
    const stored = (await payload.find({ collection: 'form-submissions', where: { ipHash: { equals: hash('203.0.113.7') } }, overrideAccess: true })).docs[0]
    expect(stored.submissionData?.map((d) => d.value)).toEqual(['Ada', 'ada@example.com', 'Ciao'])
  })
})

describe('reading submissions', () => {
  let id: number
  beforeAll(async () => {
    id = (await payload.find({ collection: 'form-submissions', limit: 1, overrideAccess: true })).docs[0].id
  })

  it('lets the owner read the list and one submission, including the IP hash', async () => {
    const list = await call('GET', 'form-submissions', { key: KEYS.owner })
    expect(list.status).toBe(200)
    expect(list.json.totalDocs).toBeGreaterThan(0)
    const one = await call('GET', `form-submissions/${id}`, { key: KEYS.owner })
    expect(one.status).toBe(200)
    expect(one.json.ipHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it.each(['demo', 'submitter', 'preview'] as const)('refuses the %s key the list, one submission and the count', async (who) => {
    for (const path of ['form-submissions', `form-submissions/${id}`, 'form-submissions/count']) {
      const res = await call('GET', path, { key: KEYS[who] })
      expect(res.status, `${who} ${path}`).toBeGreaterThanOrEqual(400)
      expect(res.text).not.toContain('ada@example.com')
    }
  })

  it('refuses anonymous reads', async () => {
    for (const path of ['form-submissions', `form-submissions/${id}`, 'form-submissions/count']) {
      expect((await call('GET', path)).status).toBeGreaterThanOrEqual(400)
    }
  })

  it('refuses every update, even by the owner, and deletes by anyone but the owner', async () => {
    expect((await call('PATCH', `form-submissions/${id}`, { key: KEYS.owner, body: { ipHash: 'x' } })).status).toBeGreaterThanOrEqual(400)
    for (const who of ['demo', 'submitter'] as const) {
      expect((await call('DELETE', `form-submissions/${id}`, { key: KEYS[who] })).status).toBeGreaterThanOrEqual(400)
    }
    expect(await count()).toBeGreaterThan(0)
  })
})

describe('the submitter rate-count capability', () => {
  const ip = hash('198.51.100.9')

  it('counts only that hash inside the window and returns nothing but the number', async () => {
    for (let i = 0; i < 2; i++) await call('POST', 'form-submissions', { key: KEYS.submitter, body: submission({ ipHash: ip }) })
    const res = await call('GET', `contact-rate?ipHash=${ip}&windowSeconds=600`, { key: KEYS.submitter })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ count: 2 })
    expect((await call('GET', `contact-rate?ipHash=${hash('nobody')}&windowSeconds=600`, { key: KEYS.submitter })).json).toEqual({ count: 0 })
  })

  it('ignores submissions older than the window', async () => {
    const old = await payload.create({
      collection: 'form-submissions',
      data: submission({ ipHash: hash('192.0.2.1') }) as never,
      overrideAccess: true,
    })
    await payload.db.drizzle.execute(
      `UPDATE cms_test.form_submissions SET created_at = now() - interval '2 hours' WHERE id = ${old.id}` as never,
    )
    expect((await call('GET', `contact-rate?ipHash=${hash('192.0.2.1')}&windowSeconds=600`, { key: KEYS.submitter })).json).toEqual({ count: 0 })
  })

  it('is closed to everyone but the submitter and rejects malformed queries', async () => {
    for (const who of ['owner', 'demo', 'preview'] as const) {
      expect((await call('GET', `contact-rate?ipHash=${ip}&windowSeconds=600`, { key: KEYS[who] })).status).toBe(403)
    }
    expect((await call('GET', `contact-rate?ipHash=${ip}&windowSeconds=600`)).status).toBe(403)
    expect((await call('GET', 'contact-rate?ipHash=zz&windowSeconds=600', { key: KEYS.submitter })).status).toBe(400)
    expect((await call('GET', `contact-rate?ipHash=${ip}&windowSeconds=999999`, { key: KEYS.submitter })).status).toBe(400)
  })
})
