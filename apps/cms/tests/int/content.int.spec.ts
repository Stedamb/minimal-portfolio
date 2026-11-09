import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { seed } from '../../src/seed'

const here = path.dirname(fileURLToPath(import.meta.url))
const seedMedia = path.resolve(here, '../../src/seed/media')

let payload: Payload
let imageId: number | string
let videoId: number | string

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#446688' } }).jpeg().toBuffer()

const createImage = async (extra: Record<string, unknown> = {}) => {
  const data = await png(3000, 2000)
  return payload.create({
    collection: 'images',
    data: { alt: 'Test photo', ...extra },
    file: { data, mimetype: 'image/jpeg', name: `test-${Math.random().toString(36).slice(2)}.jpg`, size: data.length },
    overrideAccess: true,
  })
}

let n = 0
const createProject = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  payload.create({
    collection: 'projects',
    data: {
      title: 'Test project',
      slug: `test-project-${++n}`,
      client: 'Client',
      _status: 'published',
      items: [{ blockType: 'photo', image: imageId }],
      ...data,
    } as never,
    overrideAccess: true,
    ...extra,
  })

beforeAll(async () => {
  payload = await getPayload({ config })
  imageId = (await createImage()).id
  const video = await payload.create({
    collection: 'videos',
    data: { title: 'Test clip' },
    filePath: path.join(seedMedia, 'videos/sintel/1.mp4'),
    overrideAccess: true,
  })
  videoId = video.id
})

afterAll(async () => {
  await payload.db.drizzle.execute('DROP SCHEMA IF EXISTS cms_test CASCADE' as never)
  await payload.destroy()
})

describe('projects', () => {
  it('returns items in the saved order and resolves the first to its image', async () => {
    const second = (await createImage({ alt: 'Second' })).id
    const project = await createProject({
      items: [
        { blockType: 'photo', image: imageId },
        { blockType: 'video', video: videoId },
        { blockType: 'photo', image: second },
      ],
    })
    const found = await payload.findByID({ collection: 'projects', id: project.id, depth: 1, overrideAccess: true })
    expect(found.items.map((i) => i.blockType)).toEqual(['photo', 'video', 'photo'])
    const first = found.items[0]
    expect(first.blockType === 'photo' && typeof first.image === 'object' && first.image.id).toBe(imageId)
  })

  it('rejects publishing a project with no items', async () => {
    await expect(createProject({ items: [] })).rejects.toThrow()
  })

  it('serves the Italian description when the English one is missing', async () => {
    const project = await createProject({ description: 'Descrizione in italiano' }, { locale: 'it' })
    const en = await payload.findByID({ collection: 'projects', id: project.id, locale: 'en', overrideAccess: true })
    expect(en.description).toBe('Descrizione in italiano')
  })

  it('keeps serving the published version to anonymous reads while a newer draft exists', async () => {
    const project = await createProject({ title: 'Published title' })
    await payload.update({
      collection: 'projects',
      id: project.id,
      data: { title: 'Draft title' },
      draft: true,
      overrideAccess: true,
    })
    const anonymous = await payload.findByID({ collection: 'projects', id: project.id, overrideAccess: false })
    expect(anonymous.title).toBe('Published title')

    const neverPublished = await createProject({ _status: 'draft', title: 'Never published' }, { draft: true })
    const list = await payload.find({ collection: 'projects', limit: 100, overrideAccess: false })
    expect(list.docs.map((d) => d.id)).not.toContain(neverPublished.id)
    expect(list.docs.map((d) => d.id)).toContain(project.id)
  })

  it('lets a preview API key read the draft but not change it', async () => {
    const key = 'test-preview-key-u3'
    await payload.create({
      collection: 'users',
      data: { email: 'preview@example.com', password: 'test-password-123', role: 'preview', enableAPIKey: true, apiKey: key },
      overrideAccess: true,
      context: { assignRole: true },
    })
    const { user } = await payload.auth({ headers: new Headers({ Authorization: `users API-Key ${key}` }) })
    if (!user) throw new Error('API key did not authenticate')

    const project = await createProject({ title: 'Live title' })
    await payload.update({ collection: 'projects', id: project.id, data: { title: 'Draft title' }, draft: true, overrideAccess: true })

    const draft = await payload.findByID({ collection: 'projects', id: project.id, draft: true, user, overrideAccess: false })
    expect(draft.title).toBe('Draft title')
    await expect(
      payload.update({ collection: 'projects', id: project.id, data: { title: 'Hacked' }, draft: true, user, overrideAccess: false }),
    ).rejects.toThrow()
    const after = await payload.findByID({ collection: 'projects', id: project.id, draft: true, overrideAccess: true })
    expect(after.title).toBe('Draft title')
  })
})

describe('images', () => {
  it('generates the configured sizes and stores the focal point', async () => {
    const image = await createImage({ focalX: 30, focalY: 70 })
    expect(image.focalX).toBe(30)
    expect(image.focalY).toBe(70)
    for (const size of ['w640', 'w1280', 'w1920', 'w2560'] as const) {
      expect(image.sizes?.[size]?.url, size).toBeTruthy()
      expect(image.sizes?.[size]?.mimeType).toBe('image/webp')
    }
    expect(image.sizes?.w640?.width).toBe(640)
  })
})

describe('seed', () => {
  it('creates the content once and changes nothing on a second run', async () => {
    const count = async () => ({
      projects: (await payload.count({ collection: 'projects', overrideAccess: true })).totalDocs,
      images: (await payload.count({ collection: 'images', overrideAccess: true })).totalDocs,
      videos: (await payload.count({ collection: 'videos', overrideAccess: true })).totalDocs,
      users: (await payload.count({ collection: 'users', overrideAccess: true })).totalDocs,
    })
    const before = await count()
    await seed(payload)
    const first = await count()
    expect(first.projects - before.projects).toBeGreaterThanOrEqual(6)
    await seed(payload)
    expect(await count()).toEqual(first)

    const profile = await payload.findGlobal({ slug: 'profile', overrideAccess: false })
    expect(profile.name).toBeTruthy()
    const anonymous = await payload.find({ collection: 'projects', where: { slug: { equals: 'sintel' } }, overrideAccess: false })
    expect(anonymous.docs).toHaveLength(1)
  })
})
