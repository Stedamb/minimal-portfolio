// Contract of the demo guard: the demo account can open, read and type
// everywhere it may, and no write it attempts, through any path, reaches the
// database or storage. REST goes through the real Payload route handlers.
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GRAPHQL_POST, REST_DELETE, REST_GET, REST_PATCH, REST_POST } from '@payloadcms/next/routes'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'

const DEMO_NOTICE = "Demo mode: changes aren't saved"
const here = path.dirname(fileURLToPath(import.meta.url))
const imagesDir = path.resolve(here, '../../media/images')
const PASSWORD = 'test-password-123'

let payload: Payload
let projectId: number
let imageId: number
let tokens: { owner: string; demo: string }
let demo: { id: number; email: string }
let owner: { id: number; email: string }
let previewUser: Record<string, unknown>

const handlers = {
  GET: REST_GET(config),
  POST: REST_POST(config),
  PATCH: REST_PATCH(config),
  DELETE: REST_DELETE(config),
}

type Call = { method?: keyof typeof handlers; token?: string; body?: unknown; form?: FormData; headers?: Record<string, string> }

// Calls the same handler Next mounts at /api/[...slug].
async function rest(urlPath: string, { method = 'GET', token, body, form, headers = {} }: Call = {}) {
  const url = new URL(`http://localhost:3100/api${urlPath}`)
  const request = new Request(url, {
    method,
    headers: {
      ...(token ? { Authorization: `JWT ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  const slug = url.pathname.replace(/^\/api\//, '').split('/')
  const res = await handlers[method](request, { params: Promise.resolve({ slug }) })
  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json }
}

async function graphql(query: string, token?: string) {
  const res = await GRAPHQL_POST(config)(
    new Request('http://localhost:3100/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}) },
      body: JSON.stringify({ query }),
    }),
  )
  return (await res.json()) as { data?: any; errors?: { message: string }[] }
}

const jpeg = (name: string) =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: '#446688' } })
    .jpeg()
    .toBuffer()
    .then((data) => ({ data, name }))

const uploadForm = async (name: string) => {
  const { data } = await jpeg(name)
  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(data)], { type: 'image/jpeg' }), name)
  form.set('_payload', JSON.stringify({ alt: 'Demo upload' }))
  return form
}

const login = async (email: string, password = PASSWORD) =>
  (await rest('/users/login', { method: 'POST', body: { email, password } }))

const versionCount = async (id: number) =>
  (await payload.findVersions({ collection: 'projects', where: { parent: { equals: id } }, limit: 0, overrideAccess: true })).totalDocs

const snapshot = async (id: number) => ({
  published: await payload.findByID({ collection: 'projects', id, draft: false, locale: 'all', overrideAccess: true }),
  draft: await payload.findByID({ collection: 'projects', id, draft: true, locale: 'all', overrideAccess: true }),
  versions: (await payload.findVersions({ collection: 'projects', where: { parent: { equals: id } }, limit: 0, overrideAccess: true })).docs,
})

const jobRows = async () => (await payload.db.find({ collection: 'payload-jobs', limit: 0, pagination: false })).docs

const asUser = (user: Record<string, unknown>): Promise<PayloadRequest> => createLocalReq({ user: { ...user, collection: 'users' } as never }, payload)

beforeAll(async () => {
  payload = await getPayload({ config })
  const mk = (email: string, role: string, extra: Record<string, unknown> = {}) =>
    payload.create({
      collection: 'users',
      data: { email, password: PASSWORD, role, ...extra } as never,
      overrideAccess: true,
      context: { assignRole: true },
    })
  owner = await mk('guard-owner@example.com', 'owner')
  demo = await mk('guard-demo@example.com', 'demo')
  previewUser = (await mk('guard-preview@example.com', 'preview', { enableAPIKey: true, apiKey: 'guard-preview-key' })) as never
  tokens = {
    owner: (await payload.login({ collection: 'users', data: { email: owner.email, password: PASSWORD }, overrideAccess: true })).token!,
    demo: (await payload.login({ collection: 'users', data: { email: demo.email, password: PASSWORD }, overrideAccess: true })).token!,
  }
  const { data } = await jpeg('guard-seed.jpg')
  imageId = (
    await payload.create({
      collection: 'images',
      data: { alt: 'Guard photo' },
      file: { data, mimetype: 'image/jpeg', name: 'guard-seed.jpg', size: data.length },
      overrideAccess: true,
    })
  ).id
  projectId = (
    await payload.create({
      collection: 'projects',
      data: { title: 'Guarded', slug: 'guarded', client: 'Client', _status: 'published', items: [{ blockType: 'photo', image: imageId }] } as never,
      overrideAccess: true,
    })
  ).id
  // One more version so there is something to restore.
  await payload.update({ collection: 'projects', id: projectId, data: { title: 'Guarded v2', _status: 'published' } as never, overrideAccess: true })
})

afterAll(async () => {
  await payload.db.drizzle.execute('DROP SCHEMA IF EXISTS cms_test CASCADE' as never)
  await payload.destroy()
})

describe('demo writes are rejected, and nothing is stored (R18)', () => {
  it('rejects a project title PATCH with 403 and the demo notice, leaving draft, published and versions untouched (AE1)', async () => {
    const before = await snapshot(projectId)
    const res = await rest(`/projects/${projectId}`, { method: 'PATCH', token: tokens.demo, body: { title: 'Hacked' } })
    expect(res.status).toBe(403)
    expect(JSON.stringify(res.json)).toContain(DEMO_NOTICE)
    expect(await snapshot(projectId)).toEqual(before)
  })

  it('rejects an autosave and stores no version row', async () => {
    const count = await versionCount(projectId)
    const res = await rest(`/projects/${projectId}?autosave=true&draft=true`, { method: 'PATCH', token: tokens.demo, body: { title: 'Autosaved' } })
    expect(res.status).toBe(403)
    expect(await versionCount(projectId)).toBe(count)
  })

  it('rejects a draft save and a publish', async () => {
    const before = await snapshot(projectId)
    const draft = await rest(`/projects/${projectId}?draft=true`, { method: 'PATCH', token: tokens.demo, body: { _status: 'draft', title: 'Draft' } })
    const publish = await rest(`/projects/${projectId}`, { method: 'PATCH', token: tokens.demo, body: { _status: 'published', title: 'Pub' } })
    expect([draft.status, publish.status]).toEqual([403, 403])
    expect(await snapshot(projectId)).toEqual(before)
  })

  it('rejects a bulk update', async () => {
    const before = await snapshot(projectId)
    const res = await rest('/projects?where[slug][equals]=guarded', { method: 'PATCH', token: tokens.demo, body: { client: 'Bulk' } })
    expect(res.status).toBe(403)
    expect(await snapshot(projectId)).toEqual(before)
  })

  it('rejects restoring an older version of a document and of a global', async () => {
    const before = await snapshot(projectId)
    const [oldest] = (await payload.findVersions({ collection: 'projects', where: { parent: { equals: projectId } }, sort: 'createdAt', limit: 1, overrideAccess: true })).docs
    const res = await rest(`/projects/versions/${oldest.id}`, { method: 'POST', token: tokens.demo })
    expect(res.status).toBe(403)
    expect(await snapshot(projectId)).toEqual(before)

    await payload.updateGlobal({ slug: 'profile', data: { name: 'Profile', _status: 'published' } as never, overrideAccess: true })
    const [version] = (await payload.findGlobalVersions({ slug: 'profile', limit: 1, overrideAccess: true })).docs
    const global = await rest(`/globals/profile/versions/${version.id}`, { method: 'POST', token: tokens.demo })
    expect(global.status).toBe(403)
  })

  it('rejects a global update', async () => {
    const res = await rest('/globals/profile', { method: 'POST', token: tokens.demo, body: { name: 'Hacked' } })
    expect(res.status).toBe(403)
    expect((await payload.findGlobal({ slug: 'profile', overrideAccess: true })).name).toBe('Profile')
  })

  it('rejects delete and bulk delete', async () => {
    const single = await rest(`/projects/${projectId}`, { method: 'DELETE', token: tokens.demo })
    const bulk = await rest('/projects?where[slug][equals]=guarded', { method: 'DELETE', token: tokens.demo })
    expect([single.status, bulk.status]).toEqual([403, 403])
    expect((await payload.findByID({ collection: 'projects', id: projectId, overrideAccess: true })).id).toBe(projectId)
  })

  it('rejects creating a project, duplicating one, and copying one to another locale', async () => {
    const before = (await payload.count({ collection: 'projects', overrideAccess: true })).totalDocs
    const create = await rest('/projects', {
      method: 'POST',
      token: tokens.demo,
      body: { title: 'New', slug: 'new', client: 'C', items: [{ blockType: 'photo', image: imageId }] },
    })
    const duplicate = await rest(`/projects?duplicateFromID=${projectId}`, { method: 'POST', token: tokens.demo, body: { slug: 'copy' } })
    const copyToLocale = await rest(`/projects/${projectId}?locale=en`, { method: 'PATCH', token: tokens.demo, body: { title: 'Copied' } })
    expect([create.status, duplicate.status, copyToLocale.status]).toEqual([403, 403, 403])
    expect((await payload.count({ collection: 'projects', overrideAccess: true })).totalDocs).toBe(before)
  })

  it('rejects a multipart upload and stores no file', async () => {
    const files = () => (existsSync(imagesDir) ? readdirSync(imagesDir) : [])
    const imagesBefore = (await payload.count({ collection: 'images', overrideAccess: true })).totalDocs
    const filesBefore = files()
    const res = await rest('/images', { method: 'POST', token: tokens.demo, form: await uploadForm('demo-upload.jpg') })
    expect(res.status).toBe(403)
    expect((await payload.count({ collection: 'images', overrideAccess: true })).totalDocs).toBe(imagesBefore)
    expect(files()).toEqual(filesBefore)
    expect(files().some((f) => f.startsWith('demo-'))).toBe(false)
  })

  it('refuses a client-upload token to the demo and preview roles, and keeps it open to the owner', async () => {
    const { clientUploadAccess } = await import('../../src/plugins/demo-guard')
    const ask = (user: unknown) => clientUploadAccess({ collectionSlug: 'images', req: { user } as never })
    expect(await ask({ ...demo, role: 'demo', collection: 'users' })).toBe(false)
    expect(await ask({ ...previewUser, collection: 'users' })).toBe(false)
    expect(await ask(null)).toBe(false)
    expect(await ask({ ...owner, role: 'owner', collection: 'users' })).toBe(true)
  })

  it('rejects the same writes for the preview role even when access is overridden', async () => {
    await expect(
      payload.update({ collection: 'projects', id: projectId, data: { client: 'x' } as never, user: { ...previewUser, collection: 'users' } as never, overrideAccess: true }),
    ).rejects.toThrow(DEMO_NOTICE)
    await expect(
      payload.update({ collection: 'projects', id: projectId, data: { client: 'x' } as never, user: { ...demo, role: 'demo', collection: 'users' } as never, overrideAccess: true }),
    ).rejects.toThrow(DEMO_NOTICE)
  })
})

describe('demo and the jobs queue', () => {
  const ownerSchedule = () =>
    payload.jobs.queue({
      task: 'schedulePublish',
      input: { type: 'publish', doc: { relationTo: 'projects', value: projectId }, user: { relationTo: 'users', value: owner.id } } as never,
      waitUntil: new Date(Date.now() + 3_600_000),
    })

  it('leaves no job row when the demo schedules a publish, as the schedule handler does it', async () => {
    const before = (await jobRows()).length
    // schedulePublishHandler: payload.jobs.queue with the user in the input, no req.
    await expect(
      payload.jobs.queue({
        task: 'schedulePublish',
        input: { type: 'publish', doc: { relationTo: 'projects', value: projectId }, user: { relationTo: 'users', value: demo.id } } as never,
        waitUntil: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toThrow(DEMO_NOTICE)
    expect((await jobRows()).length).toBe(before)
  })

  it("rejects the demo deleting an owner's scheduled job, as the schedule handler does it", async () => {
    const job = await ownerSchedule()
    await expect(
      payload.delete({
        collection: 'payload-jobs',
        req: await asUser({ ...demo, role: 'demo' }),
        where: { and: [{ id: { equals: job.id } }, { taskSlug: { equals: 'schedulePublish' } }] },
      }),
    ).rejects.toThrow(DEMO_NOTICE)
    expect((await jobRows()).some((j) => j.id === job.id)).toBe(true)
  })

  it('lets the demo read the schedule control state but not touch jobs over REST', async () => {
    const res = await rest('/payload-jobs', { method: 'POST', token: tokens.demo, body: { taskSlug: 'schedulePublish' } })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('refuses the jobs run endpoint to the demo, and to anyone without the owner role or the cron secret', async () => {
    const prev = process.env.CRON_SECRET
    process.env.CRON_SECRET = 'guard-cron-secret'
    try {
      expect((await rest('/payload-jobs/run', { token: tokens.demo })).status).toBe(401)
      expect((await rest('/payload-jobs/run')).status).toBe(401)
      expect((await rest('/payload-jobs/run', { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401)
      expect((await rest('/payload-jobs/run', { token: tokens.owner })).status).toBe(200)
      expect((await rest('/payload-jobs/run', { headers: { Authorization: 'Bearer guard-cron-secret' } })).status).toBe(200)
      process.env.CRON_SECRET = ''
      expect((await rest('/payload-jobs/run', { headers: { Authorization: 'Bearer ' } })).status).toBe(401)
      delete process.env.CRON_SECRET
      expect((await rest('/payload-jobs/run', { headers: { Authorization: 'Bearer undefined' } })).status).toBe(401)
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = prev
    }
  })
})

describe('demo account and users (R18, R19)', () => {
  it('rejects changing its own password or email and keeps the demo credentials working', async () => {
    const password = await rest(`/users/${demo.id}`, { method: 'PATCH', token: tokens.demo, body: { password: 'changed-password-1' } })
    const email = await rest(`/users/${demo.id}`, { method: 'PATCH', token: tokens.demo, body: { email: 'other@example.com' } })
    const key = await rest(`/users/${demo.id}`, { method: 'PATCH', token: tokens.demo, body: { enableAPIKey: true } })
    expect([password.status, email.status, key.status]).toEqual([403, 403, 403])
    expect((await login(demo.email)).status).toBe(200)
  })

  it("can't list or read users other than itself over REST and GraphQL", async () => {
    const list = await rest('/users', { token: tokens.demo })
    expect(list.json.docs.map((u: { id: number }) => u.id)).toEqual([demo.id])
    expect((await rest(`/users/${owner.id}`, { token: tokens.demo })).status).toBeGreaterThanOrEqual(403)

    const gqlList = await graphql('{ Users { docs { id email } } }', tokens.demo)
    expect(gqlList.data?.Users?.docs?.map((u: { id: number }) => u.id)).toEqual([demo.id])
    const gqlOwner = await graphql(`{ User(id: ${owner.id}) { id email } }`, tokens.demo)
    expect(gqlOwner.data?.User ?? null).toBeNull()
  })

  it('does not stop a correct login after five wrong passwords', async () => {
    for (let i = 0; i < 5; i++) expect((await login(demo.email, 'wrong-password')).status).toBe(401)
    expect((await login(demo.email)).status).toBe(200)
  })

  it('prunes expired sessions at login, so stored sessions stay bounded', async () => {
    // A user of its own: expiring sessions would invalidate the tokens the other tests hold.
    const email = 'guard-sessions@example.com'
    const user = await payload.create({ collection: 'users', data: { email, password: PASSWORD, role: 'demo' } as never, overrideAccess: true, context: { assignRole: true } })
    const sessions = async () =>
      ((await payload.findByID({ collection: 'users', id: user.id, depth: 0, showHiddenFields: true, overrideAccess: true })) as { sessions?: unknown[] }).sessions ?? []
    for (let i = 0; i < 3; i++) await login(email)
    expect((await sessions()).length).toBeGreaterThanOrEqual(3)
    await payload.db.drizzle.execute(`UPDATE cms_test.users_sessions SET expires_at = now() - interval '1 day' WHERE _parent_id = ${user.id}` as never)
    await login(email)
    expect(await sessions()).toHaveLength(1)
  })
})

describe('what the demo can still do (R17)', () => {
  it('reads projects, drafts and version history', async () => {
    const list = await rest('/projects?draft=true', { token: tokens.demo })
    expect(list.status).toBe(200)
    expect(list.json.docs.length).toBeGreaterThan(0)
    expect((await rest(`/projects/${projectId}?draft=true`, { token: tokens.demo })).status).toBe(200)
    const versions = await rest(`/projects/versions?where[parent][equals]=${projectId}`, { token: tokens.demo })
    expect(versions.status).toBe(200)
    expect(versions.json.docs.length).toBeGreaterThan(1)
    expect((await rest('/globals/profile/versions', { token: tokens.demo })).status).toBe(200)
  })

  it('keeps update permission, so the edit view stays editable and live preview keeps working', async () => {
    const doc = await rest(`/projects/access/${projectId}`, { method: 'POST', token: tokens.demo })
    expect(doc.status, JSON.stringify(doc.json)).toBe(200)
    expect(doc.json.update).toBe(true)
    expect(doc.json.fields.title.update).toBe(true)
    // A permission the role lacks is left out of the response.
    expect(doc.json.delete).toBeFalsy()
    const global = await rest('/globals/profile/access', { method: 'POST', token: tokens.demo })
    expect(global.json.update).toBe(true)
    const collection = await rest('/projects/access', { method: 'POST', token: tokens.demo })
    expect(collection.json.create).toBeFalsy()
  })

  it('stores admin preferences, such as toggling live preview', async () => {
    const res = await rest('/payload-preferences/collection-projects', { method: 'POST', token: tokens.demo, body: { value: { editViewType: 'default', livePreview: true } } })
    expect(res.status).toBe(200)
    const read = await rest('/payload-preferences/collection-projects', { token: tokens.demo })
    expect(read.json.value.livePreview).toBe(true)
  })
})

describe('locks (R18)', () => {
  it('creates no lock when a document is opened, because no document can be locked', async () => {
    expect(payload.config.collections.map((c) => c.slug as string).includes('payload-locked-documents')).toBe(false)
    const res = await rest('/payload-locked-documents', { method: 'POST', token: tokens.demo, body: { document: { relationTo: 'projects', value: projectId } } })
    expect(res.status).toBeGreaterThanOrEqual(400)
    // So the owner can edit the same document at the same time.
    const updated = await payload.update({ collection: 'projects', id: projectId, data: { client: 'Edited by owner' } as never, user: { ...owner, role: 'owner', collection: 'users' } as never, overrideAccess: false })
    expect(updated.client).toBe('Edited by owner')
  })
})

describe('preferences middleware (writes go straight to the database, KTD8)', () => {
  const call = async (method: string, urlPath: string, body?: string, contentType = 'application/json') => {
    const { NextRequest } = await import('next/server')
    const { proxy } = await import('../../src/proxy')
    const res = await proxy(new NextRequest(`http://localhost:3100${urlPath}`, { method, body, headers: body ? { 'Content-Type': contentType } : {} }))
    return { status: res.status, passes: res.headers.get('x-middleware-next') === '1' }
  }
  const small = JSON.stringify({ value: { open: true } })

  it('lets the keys the admin writes through', async () => {
    const keys = [
      'nav',
      'locale',
      'dashboard-layout',
      'browse-by-folder',
      'collection-projects',
      'global-profile',
      'projects-collection-folder',
    ]
    for (const key of keys) expect(await call('POST', `/api/payload-preferences/${key}`, small), key).toEqual({ status: 200, passes: true })
  })

  it('answers a per-document key without storing it', async () => {
    const before = (await payload.count({ collection: 'payload-preferences', overrideAccess: true })).totalDocs
    const res = await call('POST', '/api/payload-preferences/collection-projects-42', small)
    expect(res).toEqual({ status: 200, passes: false })
    expect((await payload.count({ collection: 'payload-preferences', overrideAccess: true })).totalDocs).toBe(before)
  })

  it('lets every collection and global of this config store its list and document preferences', async () => {
    const slugs = payload.config.collections.map((c) => c.slug).filter((s) => !s.startsWith('payload-'))
    for (const slug of slugs) {
      expect((await call('POST', `/api/payload-preferences/collection-${slug}`, small)).passes, slug).toBe(true)
      expect((await call('POST', `/api/payload-preferences/${slug}-collection-folder`, small)).passes, slug).toBe(true)
    }
    for (const { slug } of payload.config.globals) expect((await call('POST', `/api/payload-preferences/global-${slug}`, small)).passes, slug).toBe(true)
  })

  it('refuses an unknown key, a body over 16 KB, and the other ways to write a preference', async () => {
    expect((await call('POST', '/api/payload-preferences/anything-i-like', small)).status).toBe(400)
    expect((await call('POST', '/api/payload-preferences/nav', JSON.stringify({ value: 'x'.repeat(16 * 1024) }))).status).toBe(413)
    expect((await call('POST', '/api/payload-preferences', JSON.stringify({ key: 'nav', value: {} }))).status).toBe(403)
    expect((await call('PATCH', '/api/payload-preferences/1', small)).status).toBe(403)
  })

  it('refuses the GraphQL preference mutations, which would skip the cap', async () => {
    const schema = await graphql('{ __schema { mutationType { fields { name } } } }', tokens.owner)
    const names = schema.data.__schema.mutationType.fields.map((f: { name: string }) => f.name)
    expect(names).toEqual(expect.arrayContaining(['createPayloadPreference', 'updatePayloadPreference', 'deletePayloadPreference']))
    const mutation = JSON.stringify({ query: 'mutation { createPayloadPreference(data: { key: "x" }) { id } }' })
    expect((await call('POST', '/api/graphql', mutation)).status).toBe(403)
    expect((await call('POST', '/api/graphql', JSON.stringify({ query: '{ Projects { totalDocs } }' }))).passes).toBe(true)
  })

  it('reads the GraphQL query the way graphql-http does, not the raw body', async () => {
    const escaped = '{"query":"mutation { \\u0063reatePayloadPreference(data: { key: \\"x\\" }) { id } }"}'
    expect(JSON.parse(escaped).query).toContain('createPayloadPreference')
    expect((await call('POST', '/api/graphql', escaped)).status).toBe(403)
    const batch = JSON.stringify([{ query: '{ Projects { totalDocs } }' }, { query: 'mutation { deletePayloadPreference(id: 1) { id } }' }])
    expect((await call('POST', '/api/graphql', batch)).status).toBe(403)
    expect((await call('POST', '/api/graphql', 'not json')).status).toBe(400)
    expect((await call('POST', '/api/graphql', JSON.stringify({ query: 7 }))).status).toBe(400)
    expect((await call('POST', '/api/graphql', 'mutation { createPayloadPreference(data: {}) { id } }', 'application/graphql')).status).toBe(403)
    expect((await call('POST', '/api/graphql', '--x', 'multipart/form-data; boundary=x')).status).toBe(415)
    expect((await call('POST', '/api/graphql', JSON.stringify([{ query: '{ Projects { totalDocs } }' }]))).passes).toBe(true)
  })

  it('leaves reads, deletes and every other route alone', async () => {
    expect((await call('GET', '/api/payload-preferences/nav')).passes).toBe(true)
    expect((await call('DELETE', '/api/payload-preferences?where[key][equals]=nav')).passes).toBe(true)
    expect((await call('POST', '/api/projects', small)).passes).toBe(true)
    expect((await call('GET', '/admin')).passes).toBe(true)
  })
})

describe('the owner is not affected', () => {
  it('edits, autosaves, publishes, restores, creates, uploads, runs jobs and deletes', async () => {
    const t = tokens.owner
    expect((await rest(`/projects/${projectId}`, { method: 'PATCH', token: t, body: { title: 'Owner title' } })).status).toBe(200)
    expect((await rest(`/projects/${projectId}?autosave=true&draft=true`, { method: 'PATCH', token: t, body: { title: 'Owner autosave' } })).status).toBe(200)
    expect((await rest(`/projects/${projectId}`, { method: 'PATCH', token: t, body: { _status: 'published', title: 'Owner published' } })).status).toBe(200)

    const [oldest] = (await payload.findVersions({ collection: 'projects', where: { parent: { equals: projectId } }, sort: 'createdAt', limit: 1, overrideAccess: true })).docs
    expect((await rest(`/projects/versions/${oldest.id}`, { method: 'POST', token: t })).status).toBe(200)

    const created = await rest('/projects', {
      method: 'POST',
      token: t,
      body: { title: 'Owner new', slug: 'owner-new', client: 'C', _status: 'published', items: [{ blockType: 'photo', image: imageId }] },
    })
    expect(created.status, JSON.stringify(created.json)).toBe(201)
    const copy = await rest('/projects', { method: 'POST', token: t, body: { title: 'Owner copy', slug: 'owner-copy', client: 'C', _status: 'published', items: [{ blockType: 'photo', image: imageId }] } })
    expect(copy.status, JSON.stringify(copy.json)).toBe(201)

    const upload = await rest('/images', { method: 'POST', token: t, form: await uploadForm('owner-upload.jpg') })
    expect(upload.status).toBe(201)

    expect((await rest('/globals/profile', { method: 'POST', token: t, body: { name: 'Owner profile' } })).status).toBe(200)
    expect((await rest(`/users/${owner.id}`, { method: 'PATCH', token: t, body: { password: PASSWORD } })).status).toBe(200)

    const job = await payload.jobs.queue({
      task: 'schedulePublish',
      input: { type: 'publish', doc: { relationTo: 'projects', value: projectId }, user: { relationTo: 'users', value: owner.id } } as never,
      waitUntil: new Date(Date.now() + 3_600_000),
    })
    expect(job.id).toBeTruthy()
    const run = await rest('/payload-jobs/run', { token: t })
    expect(run.status).toBe(200)

    expect((await rest(`/projects/${created.json.doc.id}`, { method: 'DELETE', token: t })).status).toBe(200)
    expect((await rest('/projects?where[slug][equals]=owner-copy', { method: 'DELETE', token: t })).status).toBe(200)
  })
})

describe('registration, seed and password reset still work with the guard installed', () => {
  it('registers the first user, runs the seed users step and answers forgot-password', async () => {
    const { seedUsers } = await import('../../src/seed/users')
    const env = { ...process.env }
    await payload.delete({ collection: 'users', where: { id: { exists: true } }, overrideAccess: true })
    expect((await payload.count({ collection: 'users', overrideAccess: true })).totalDocs).toBe(0)

    const first = await rest('/users/first-register', { method: 'POST', body: { email: 'first@example.com', password: PASSWORD, 'confirm-password': PASSWORD } })
    expect(first.status).toBe(200)
    const [firstUser] = (await payload.find({ collection: 'users', overrideAccess: true })).docs
    expect(firstUser.role).toBeFalsy()
    // Through the Local API with `disableEmail`: over REST, Payload reserves the request on a second
    // database connection while a transaction is open, which deadlocks the single-session PGlite
    // used here (and in local dev). The guard sees the same `forgotPassword` operation either way.
    const token = await payload.forgotPassword({ collection: 'users', data: { email: 'first@example.com' }, disableEmail: true })
    expect(token).toBeTruthy()

    await payload.delete({ collection: 'users', where: { id: { exists: true } }, overrideAccess: true })
    try {
      // No owner configured: the seed refuses to create the demo user.
      delete process.env.OWNER_EMAIL
      await expect(seedUsers(payload)).rejects.toThrow()
      expect((await payload.count({ collection: 'users', where: { role: { equals: 'demo' } }, overrideAccess: true })).totalDocs).toBe(0)

      process.env.OWNER_EMAIL = 'seed-owner@example.com'
      process.env.OWNER_PASSWORD = PASSWORD
      process.env.DEMO_EMAIL = 'seed-demo@example.com'
      process.env.DEMO_PASSWORD = PASSWORD
      process.env.PREVIEW_API_KEY = 'seed-preview-key'
      process.env.SUBMITTER_API_KEY = 'seed-submitter-key'
      await seedUsers(payload)
      await seedUsers(payload) // idempotent
      const users = (await payload.find({ collection: 'users', limit: 0, pagination: false, overrideAccess: true })).docs
      expect(users.map((u) => u.role).sort()).toEqual(['demo', 'owner', 'preview', 'submitter'])
      expect((await login('seed-demo@example.com')).status).toBe(200)
      const { user } = await payload.auth({ headers: new Headers({ Authorization: 'users API-Key seed-preview-key' }) })
      expect((user as { role?: string } | null)?.role).toBe('preview')
    } finally {
      for (const key of ['OWNER_EMAIL', 'OWNER_PASSWORD', 'DEMO_EMAIL', 'DEMO_PASSWORD', 'PREVIEW_API_KEY', 'SUBMITTER_API_KEY']) {
        if (env[key] === undefined) delete process.env[key]
        else process.env[key] = env[key]
      }
    }
  })
})
