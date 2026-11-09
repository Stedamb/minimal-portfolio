// Contract of the MCP endpoint (KTD12, R21, R22, AE6, U10): owner-only. The requests go
// through the real /api/mcp handler as JSON-RPC over Streamable HTTP.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { REST_POST } from '@payloadcms/next/routes'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'

const PASSWORD = 'test-password-123'
const OWNER_KEY = 'mcp-test-owner-key'
const DEMO_KEY = 'mcp-test-demo-key'
const ALL_TOOLS = {
  projects: { find: true, create: true, update: true },
  images: { find: true, create: true, update: true },
  videos: { find: true, create: true, update: true },
  profile: { find: true, update: true },
}

let payload: Payload
let server: Server
let purgeCalls = 0
let imageId: number
let demo: { id: number }

const post = REST_POST(config)
async function rpc(method: string, params: unknown, key?: string, id = 1) {
  const res = await post(
    new Request('http://localhost:3100/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    }),
    { params: Promise.resolve({ slug: ['mcp'] }) },
  )
  const text = await res.text()
  // Streamable HTTP answers as JSON or as a single SSE event, depending on the server.
  const data = text.split('\n').find((line) => line.startsWith('data:'))?.slice(5) ?? text
  let json: any = null
  try {
    json = JSON.parse(data)
  } catch {}
  return { status: res.status, json, text }
}

const initialize = (key?: string) =>
  rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } }, key)
const callTool = async (name: string, args: Record<string, unknown>) => {
  const res = await rpc('tools/call', { name, arguments: args }, OWNER_KEY)
  return { ...res, output: res.json?.result?.content?.[0]?.text as string }
}

let n = 0
const createProject = (data: Record<string, unknown> = {}) =>
  payload.create({
    collection: 'projects',
    data: { title: 'Titolo', slug: `mcp-${++n}`, client: 'Client', description: 'Descrizione', items: [{ blockType: 'photo', image: imageId }], ...data } as never,
    overrideAccess: true,
  })

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/revalidate') purgeCalls++
    req.resume()
    res.writeHead(200).end('{}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.WEB_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.REVALIDATE_SECRET = 'mcp-revalidate-secret'

  payload = await getPayload({ config })
  const mk = (email: string, role: string) =>
    payload.create({ collection: 'users', data: { email, password: PASSWORD, role } as never, overrideAccess: true, context: { assignRole: true } })
  const owner = await mk('mcp-owner@example.com', 'owner')
  demo = await mk('mcp-demo@example.com', 'demo')
  const mkKey = (user: number, apiKey: string) =>
    payload.create({
      collection: 'payload-mcp-api-keys',
      data: { user, label: 'test', enableAPIKey: true, apiKey, ...ALL_TOOLS } as never,
      overrideAccess: true,
    })
  await mkKey(owner.id, OWNER_KEY)
  await mkKey(demo.id, DEMO_KEY)
  const data = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#775533' } }).jpeg().toBuffer()
  imageId = (
    await payload.create({
      collection: 'images',
      data: { alt: 'MCP photo' },
      file: { data, mimetype: 'image/jpeg', name: 'mcp-seed.jpg', size: data.length },
      overrideAccess: true,
    })
  ).id
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await payload.db.drizzle.execute('DROP SCHEMA IF EXISTS cms_test CASCADE' as never)
  await payload.destroy()
})

describe('who can use the endpoint (AE6)', () => {
  it('refuses a request without an Authorization header', async () => {
    const res = await initialize()
    expect(res.status).toBe(401)
  })

  it('refuses an unknown key', async () => {
    expect((await initialize('not-a-real-key')).status).toBe(401)
  })

  it('refuses a key that belongs to a demo user', async () => {
    const res = await rpc('tools/list', {}, DEMO_KEY)
    expect(res.status).toBe(401)
    expect(res.text).not.toContain('createProjects')
  })

  it('accepts the owner key', async () => {
    const res = await initialize(OWNER_KEY)
    expect(res.status).toBe(200)
    expect(res.json.result.serverInfo).toBeTruthy()
  })

  it('refuses the demo account creating an MCP API key through REST', async () => {
    const token = (await payload.login({ collection: 'users', data: { email: 'mcp-demo@example.com', password: PASSWORD }, overrideAccess: true })).token!
    const res = await post(
      new Request('http://localhost:3100/api/payload-mcp-api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `JWT ${token}` },
        body: JSON.stringify({ user: demo.id, label: 'sneaky', enableAPIKey: true, apiKey: 'sneaky-key', projects: { find: true } }),
      }),
      { params: Promise.resolve({ slug: ['payload-mcp-api-keys'] }) },
    )
    expect(res.status).toBe(403)
    expect((await payload.count({ collection: 'payload-mcp-api-keys', where: { label: { equals: 'sneaky' } }, overrideAccess: true })).totalDocs).toBe(0)
  })
})

describe('tools', () => {
  it('offers find, create and update, and no delete tool', async () => {
    const res = await rpc('tools/list', {}, OWNER_KEY)
    const names: string[] = res.json.result.tools.map((tool: { name: string }) => tool.name)
    expect(names).toEqual(expect.arrayContaining(['findProjects', 'createProjects', 'updateProjects', 'findProfile', 'updateProfile']))
    expect(names.filter((name) => /delete/i.test(name))).toEqual([])
  })

  it('creates a project as a draft: unpublished, visible to the owner, and no purge', async () => {
    purgeCalls = 0
    const res = await callTool('createProjects', {
      title: 'Created over MCP',
      slug: 'created-over-mcp',
      client: 'Client',
      items: [{ blockType: 'photo', image: imageId }],
      draft: true,
    })
    expect(res.output, res.text).toContain('created successfully')

    const published = await payload.find({ collection: 'projects', where: { slug: { equals: 'created-over-mcp' } }, draft: false, overrideAccess: false, limit: 1 })
    expect(published.docs).toEqual([])
    const asOwner = await payload.find({ collection: 'projects', where: { slug: { equals: 'created-over-mcp' } }, draft: true, overrideAccess: true, limit: 1 })
    expect(asOwner.docs[0]._status).toBe('draft')

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(purgeCalls).toBe(0)
  })

  it('updating the English description changes only the en value', async () => {
    const project = await createProject({ description: 'Descrizione italiana' })
    const res = await callTool('updateProjects', { id: project.id, description: 'English description', locale: 'en', draft: true })
    expect(res.output, res.text).toContain('updated successfully')

    const all = await payload.findByID({ collection: 'projects', id: project.id, locale: 'all', draft: true, overrideAccess: true })
    expect(all.description).toEqual({ it: 'Descrizione italiana', en: 'English description' })
    expect(all.title).toMatchObject({ it: 'Titolo' })
    expect((all.title as unknown as { en?: string }).en ?? null).toBeNull()
  })
})
