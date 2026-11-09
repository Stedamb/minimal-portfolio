// Contract of the cache purge hooks (KTD6, U6): publishing purges exactly the affected tags
// by POSTing them to web's /api/revalidate; draft saves never do; a lost purge never fails
// the owner's save. WEB_URL points at a local HTTP server that records what it receives.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import config from '../../src/payload.config'

type Call = { tags: string[]; authorization?: string; bypass?: string }

let payload: Payload
let server: Server
let calls: Call[] = []
let respondWith = 200
let imageId: number
let owner: { id: number; email: string }

const SECRET = 'purge-test-secret'
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
// The hooks run after the save, so a purge that should NOT happen is checked after a settle time.
const settle = () => wait(300)
const purged = async (count = 1) => {
  await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(count), { timeout: 5000 })
  await settle()
  return calls.flatMap((call) => call.tags)
}

let n = 0
const createProject = (data: Record<string, unknown> = {}) =>
  payload.create({
    collection: 'projects',
    data: {
      title: 'Purge test',
      slug: `purge-test-${++n}`,
      client: 'Client',
      items: [{ blockType: 'photo', image: imageId }],
      ...data,
    } as never,
    overrideAccess: true,
  })
const update = (id: number, data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  payload.update({ collection: 'projects', id, data: data as never, overrideAccess: true, ...extra })

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/api/revalidate') {
        calls.push({
          tags: JSON.parse(body).tags,
          authorization: req.headers.authorization,
          bypass: req.headers['x-vercel-protection-bypass'] as string | undefined,
        })
      }
      res.writeHead(respondWith).end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.WEB_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.REVALIDATE_SECRET = SECRET
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret'

  payload = await getPayload({ config })
  owner = (await payload.create({
    collection: 'users',
    data: { email: 'purge-owner@example.com', password: 'test-password-123', role: 'owner' } as never,
    overrideAccess: true,
    context: { assignRole: true },
  })) as never
  const data = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#335577' } }).jpeg().toBuffer()
  imageId = (
    await payload.create({
      collection: 'images',
      data: { alt: 'Purge photo' },
      file: { data, mimetype: 'image/jpeg', name: 'purge-seed.jpg', size: data.length },
      overrideAccess: true,
    })
  ).id
  await settle()
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await payload.db.drizzle.execute('DROP SCHEMA IF EXISTS cms_test CASCADE' as never)
  await payload.destroy()
})

beforeEach(() => {
  calls = []
  respondWith = 200
})

describe('draft saves never purge', () => {
  it('saving or autosaving a never-published project calls the purge endpoint zero times', async () => {
    const project = await createProject({ _status: 'draft' })
    await update(project.id, { title: 'Edited draft' }, { draft: true })
    await update(project.id, { title: 'Autosaved' }, { draft: true, autosave: true })
    await settle()
    expect(calls).toEqual([])
  })

  it('saving or autosaving an already-published project calls the purge endpoint zero times', async () => {
    const project = await createProject({ _status: 'published' })
    await settle()
    calls = []
    await update(project.id, { title: 'Draft over published' }, { draft: true })
    await update(project.id, { title: 'Autosaved over published' }, { draft: true, autosave: true })
    await update(project.id, { title: 'Draft again' }, { draft: true })
    await settle()
    expect(calls).toEqual([])
  })
})

describe('publishing a project', () => {
  it('purges its project tag and the portfolio list, and neither the homepage nor the layout tag', async () => {
    const project = await createProject({ _status: 'published', featured: false })
    const tags = await purged()
    expect(tags.sort()).toEqual(['portfolio', `project:${project.id}`].sort())
    expect(calls).toHaveLength(1)
    expect(calls[0].authorization).toBe(`Bearer ${SECRET}`)
    expect(calls[0].bypass).toBe('bypass-secret')
  })

  it('publishing a draft over a published project purges it', async () => {
    const project = await createProject({ _status: 'published' })
    await settle()
    calls = []
    await update(project.id, { title: 'Pending' }, { draft: true })
    await update(project.id, { title: 'Live now', _status: 'published' })
    expect(await purged()).toContain(`project:${project.id}`)
  })

  it('purges the featured tag when a project goes from featured to unfeatured, even through a saved draft', async () => {
    const project = await createProject({ _status: 'published', featured: true })
    await settle()
    calls = []
    // The editor unticks "featured" in a draft first, then publishes it.
    await update(project.id, { featured: false }, { draft: true })
    await update(project.id, { featured: false, _status: 'published' })
    const tags = await purged()
    expect(tags).toContain('featured')
    expect(tags).toContain(`project:${project.id}`)
  })

  it('purges the featured tag when a project goes from unfeatured to featured', async () => {
    const project = await createProject({ _status: 'published', featured: false })
    await settle()
    calls = []
    await update(project.id, { featured: true, _status: 'published' })
    expect(await purged()).toContain('featured')
  })

  it('purges by id when the slug changes, so the old URL is purged', async () => {
    const project = await createProject({ _status: 'published' })
    await settle()
    calls = []
    await update(project.id, { slug: `renamed-${project.id}`, _status: 'published' })
    expect(await purged()).toContain(`project:${project.id}`)
  })

  it('a scheduled-publish job run, which has no req.user, still purges', async () => {
    const project = await createProject({ _status: 'draft', featured: true })
    await settle()
    calls = []
    await payload.jobs.queue({
      task: 'schedulePublish',
      input: { type: 'publish', doc: { relationTo: 'projects', value: project.id }, user: { relationTo: 'users', value: owner.id } } as never,
      waitUntil: new Date(Date.now() - 60_000),
    })
    await payload.jobs.run()
    const tags = await purged()
    expect(tags).toEqual(expect.arrayContaining([`project:${project.id}`, 'portfolio', 'featured']))
    const live = await payload.findByID({ collection: 'projects', id: project.id, draft: false, overrideAccess: true })
    expect(live._status).toBe('published')
  })
})

describe('unpublishing and deleting a project', () => {
  it('unpublishing a published project purges its tag', async () => {
    const project = await createProject({ _status: 'published' })
    await settle()
    calls = []
    await update(project.id, { _status: 'draft' })
    expect(await purged()).toContain(`project:${project.id}`)
  })

  it('unpublishing a featured project purges the featured tag', async () => {
    const project = await createProject({ _status: 'published', featured: true })
    await settle()
    calls = []
    await update(project.id, { _status: 'draft' })
    expect(await purged()).toContain('featured')
  })

  it('unpublishing after a draft was saved still purges', async () => {
    const project = await createProject({ _status: 'published' })
    await settle()
    calls = []
    await update(project.id, { title: 'Pending edit' }, { draft: true })
    await update(project.id, { _status: 'draft' })
    expect(await purged()).toContain(`project:${project.id}`)
  })

  it('deleting a project purges its tag', async () => {
    const project = await createProject({ _status: 'published' })
    await settle()
    calls = []
    await payload.delete({ collection: 'projects', id: project.id, overrideAccess: true })
    expect(await purged()).toContain(`project:${project.id}`)
  })
})

describe('profile and media', () => {
  it('publishing the profile global purges the layout tag', async () => {
    await payload.updateGlobal({ slug: 'profile', data: { name: 'Purge profile', _status: 'published' } as never, overrideAccess: true })
    expect(await purged()).toContain('layout')
  })

  it('saving a profile draft purges nothing', async () => {
    await payload.updateGlobal({ slug: 'profile', data: { name: 'Draft profile' } as never, draft: true, overrideAccess: true })
    await settle()
    expect(calls).toEqual([])
  })

  it('updating an image purges that media tag', async () => {
    await payload.update({ collection: 'images', id: imageId, data: { alt: 'New alt' }, overrideAccess: true })
    expect(await purged()).toContain(`media:images:${imageId}`)
  })
})

describe('when the purge fails', () => {
  it("the owner's publish still succeeds and the failure is logged", async () => {
    const previous = process.env.WEB_URL
    process.env.WEB_URL = 'http://127.0.0.1:1'
    const error = vi.spyOn(payload.logger, 'error')
    try {
      const project = await createProject({ _status: 'published' })
      expect(project._status).toBe('published')
      await vi.waitFor(() => expect(error).toHaveBeenCalled(), { timeout: 5000 })
    } finally {
      process.env.WEB_URL = previous
      error.mockRestore()
    }
  })

  it('logs a non-2xx answer without failing the save', async () => {
    respondWith = 401
    const error = vi.spyOn(payload.logger, 'error')
    try {
      const project = await createProject({ _status: 'published' })
      expect(project._status).toBe('published')
      await vi.waitFor(() => expect(error).toHaveBeenCalled(), { timeout: 5000 })
    } finally {
      error.mockRestore()
    }
  })
})
