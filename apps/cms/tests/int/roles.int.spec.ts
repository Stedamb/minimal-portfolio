import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'

let payload: Payload
const keys = { preview: 'test-preview-key', submitter: 'test-submitter-key' }

const create = (email: string, extra: Record<string, unknown> = {}) =>
  payload.create({
    collection: 'users',
    data: { email, password: 'test-password-123', ...extra } as never,
    overrideAccess: true,
  })

const viaApiKey = async (key: string) => {
  const { user } = await payload.auth({ headers: new Headers({ Authorization: `users API-Key ${key}` }) })
  if (!user) throw new Error('API key did not authenticate')
  return user
}

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.db.drizzle.execute('DROP SCHEMA IF EXISTS cms_test CASCADE' as never)
  await payload.destroy()
})

describe('users roles', () => {
  it('gives the very first user, created with no role, no role at all', async () => {
    const first = await create('first@example.com')
    expect(first.role).toBeFalsy()
  })

  it('drops an owner role requested without an owner or the seed (create-first-user, REST, anonymous)', async () => {
    const sneaky = await create('sneaky@example.com', { role: 'owner' })
    expect(sneaky.role).toBeFalsy()
  })

  it('lets the seed assign roles explicitly through the Local API context', async () => {
    const owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@example.com', password: 'test-password-123', role: 'owner' },
      overrideAccess: true,
      context: { assignRole: true },
    })
    expect(owner.role).toBe('owner')
  })

  it('never lets the demo user give itself the owner role', async () => {
    const demo = await payload.create({
      collection: 'users',
      data: { email: 'demo@example.com', password: 'test-password-123', role: 'demo' },
      overrideAccess: true,
      context: { assignRole: true },
    })
    await expect(
      payload.update({
        collection: 'users',
        id: demo.id,
        data: { role: 'owner' },
        user: { ...demo, collection: 'users' },
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    const after = await payload.findByID({ collection: 'users', id: demo.id, overrideAccess: true })
    expect(after.role).toBe('demo')
  })

  it('does not let a request without owner rights change a role even when access is overridden', async () => {
    const [demo] = (await payload.find({ collection: 'users', where: { email: { equals: 'demo@example.com' } }, overrideAccess: true })).docs
    const updated = await payload.update({ collection: 'users', id: demo.id, data: { role: 'owner' } as never, overrideAccess: true })
    expect(updated.role).toBe('demo')
  })
})

describe('users read access', () => {
  it('lets the owner read the whole users list', async () => {
    const [owner] = (await payload.find({ collection: 'users', where: { email: { equals: 'owner@example.com' } }, overrideAccess: true })).docs
    const list = await payload.find({ collection: 'users', user: { ...owner, collection: 'users' }, overrideAccess: false })
    expect(list.totalDocs).toBeGreaterThan(1)
  })

  it('shows a user without the owner role only itself', async () => {
    const [demo] = (await payload.find({ collection: 'users', where: { email: { equals: 'demo@example.com' } }, overrideAccess: true })).docs
    const list = await payload.find({ collection: 'users', user: { ...demo, collection: 'users' }, overrideAccess: false })
    expect(list.docs.map((u) => u.id)).toEqual([demo.id])
  })

  it('lets a submitter API key read nothing from users', async () => {
    await payload.create({
      collection: 'users',
      data: { email: 'submitter@example.com', password: 'test-password-123', role: 'submitter', enableAPIKey: true, apiKey: keys.submitter },
      overrideAccess: true,
      context: { assignRole: true },
    })
    const submitter = await viaApiKey(keys.submitter)
    expect(submitter.role).toBe('submitter')
    await expect(payload.find({ collection: 'users', user: submitter, overrideAccess: false })).rejects.toThrow()
  })
})
