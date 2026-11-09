// Contract of scheduled publishing: a scheduled publish runs
// unattended through the jobs run endpoint, fires the same purge as a manual publish,
// and only the owner or the cron secret can start a run. The REST handler is the one
// Next mounts at /api/[...slug]; WEB_URL points at a local server that records purges.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { REST_GET } from '@payloadcms/next/routes'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '../../src/payload.config'

const CRON_SECRET = 'schedule-test-cron-secret'
const PASSWORD = 'test-password-123'

let payload: Payload
let server: Server
let purges: string[][] = []
let imageId: number
let owner: { id: number }
let ownerToken: string

const get = REST_GET(config)
async function runJobs(headers: Record<string, string> = {}) {
  const res = await get(new Request('http://localhost:3100/api/payload-jobs/run', { headers }), {
    params: Promise.resolve({ slug: ['payload-jobs', 'run'] }),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

let n = 0
const createDraft = (data: Record<string, unknown> = {}) =>
  payload.create({
    collection: 'projects',
    data: { title: 'Scheduled', slug: `scheduled-${++n}`, client: 'Client', _status: 'draft', items: [{ blockType: 'photo', image: imageId }], ...data } as never,
    draft: true,
    overrideAccess: true,
  })

const schedule = (id: number, waitUntil: Date) =>
  payload.jobs.queue({
    task: 'schedulePublish',
    input: { type: 'publish', doc: { relationTo: 'projects', value: id }, user: { relationTo: 'users', value: owner.id } } as never,
    waitUntil,
  })

const published = (id: number) => payload.findByID({ collection: 'projects', id, draft: false, overrideAccess: true })
const aMinuteAgo = () => new Date(Date.now() - 60_000)

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/api/revalidate') purges.push(JSON.parse(body).tags)
      res.writeHead(200).end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.WEB_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.REVALIDATE_SECRET = 'schedule-revalidate-secret'
  process.env.CRON_SECRET = CRON_SECRET

  payload = await getPayload({ config })
  owner = await payload.create({
    collection: 'users',
    data: { email: 'schedule-owner@example.com', password: PASSWORD, role: 'owner' } as never,
    overrideAccess: true,
    context: { assignRole: true },
  })
  ownerToken = (await payload.login({ collection: 'users', data: { email: 'schedule-owner@example.com', password: PASSWORD }, overrideAccess: true })).token!
  const data = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#553377' } }).jpeg().toBuffer()
  imageId = (
    await payload.create({
      collection: 'images',
      data: { alt: 'Schedule photo' },
      file: { data, mimetype: 'image/jpeg', name: 'schedule-seed.jpg', size: data.length },
      overrideAccess: true,
    })
  ).id
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await payload.db.drizzle.execute('DROP SCHEMA IF EXISTS cms_test CASCADE' as never)
  await payload.destroy()
})

describe('a due scheduled publish (AE4)', () => {
  it('goes live through one run with the cron secret, and purges the cache', async () => {
    const project = await createDraft()
    await schedule(project.id, aMinuteAgo())
    expect((await published(project.id))._status).toBe('draft')
    purges = []

    const run = await runJobs({ authorization: `Bearer ${CRON_SECRET}` })
    expect(run.status).toBe(200)

    expect((await published(project.id))._status).toBe('published')
    await vi.waitFor(() => expect(purges.flat()).toContain(`project:${project.id}`), { timeout: 5000 })
  })

  it('does not publish a schedule that is not due yet', async () => {
    const project = await createDraft()
    await schedule(project.id, new Date(Date.now() + 3_600_000))
    await runJobs({ authorization: `Bearer ${CRON_SECRET}` })
    expect((await published(project.id))._status).toBe('draft')
  })

  it('publishes the latest draft when it was edited after the schedule was created', async () => {
    const project = await createDraft({ title: 'First draft' })
    await schedule(project.id, aMinuteAgo())
    await payload.update({ collection: 'projects', id: project.id, data: { title: 'Edited after scheduling' }, draft: true, overrideAccess: true })

    expect((await runJobs({ authorization: `Bearer ${CRON_SECRET}` })).status).toBe(200)

    const live = await published(project.id)
    expect(live._status).toBe('published')
    expect(live.title).toBe('Edited after scheduling')
  })
})

describe('who can run jobs', () => {
  it('refuses a run with neither a user nor the secret, and a wrong secret', async () => {
    const project = await createDraft()
    await schedule(project.id, aMinuteAgo())
    expect((await runJobs()).status).toBe(401)
    expect((await runJobs({ authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await published(project.id))._status).toBe('draft')
  })

  it('lets a signed-in owner run it', async () => {
    expect((await runJobs({ authorization: `JWT ${ownerToken}` })).status).toBe(200)
  })
})
