import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import type { Payload } from 'payload'

import type { Role } from '../access/roles'

const SECRET_KEYS = ['PAYLOAD_SECRET', 'OWNER_PASSWORD', 'DEMO_PASSWORD', 'PREVIEW_API_KEY', 'SUBMITTER_API_KEY'] as const

// Refuses to seed a remote database with the publicly known example credentials,
// which is what happens if the production values were not exported before seeding.
export function assertNoExampleSecrets(env: Record<string, string | undefined> = process.env): void {
  const host = env.DATABASE_URL ? new URL(env.DATABASE_URL).hostname : 'localhost'
  if (['localhost', '127.0.0.1', '::1'].includes(host)) return
  const exampleFile = new URL('../../../../.env.example', import.meta.url)
  if (!existsSync(exampleFile)) return
  const example = parseEnv(readFileSync(exampleFile, 'utf8'))
  const reused = SECRET_KEYS.filter((key) => env[key] && env[key] === example[key])
  if (reused.length) throw new Error(`Refusing to seed ${host}: ${reused.join(', ')} still use the .env.example values`)
}


// Creates the accounts, owner first. Idempotent: an existing email is left alone.
export async function seedUsers(payload: Payload): Promise<void> {
  const log = payload.logger.info.bind(payload.logger)

  const exists = async (where: Record<string, unknown>) =>
    (await payload.count({ collection: 'users', where: where as never, overrideAccess: true })).totalDocs > 0

  const create = async (role: Role, data: { email: string; password?: string; apiKey?: string }) => {
    if (await exists({ email: { equals: data.email } })) return
    await payload.create({
      collection: 'users',
      // API-key service users never log in; give them a random password.
      data: {
        email: data.email,
        password: data.password ?? crypto.randomUUID(),
        role,
        ...(data.apiKey ? { enableAPIKey: true, apiKey: data.apiKey } : {}),
      } as never,
      overrideAccess: true,
      // Only the seed may assign a role (see the users collection).
      context: { assignRole: true },
    })
    log(`seed: created ${role} ${data.email}`)
  }

  assertNoExampleSecrets()

  const ownerEmail = process.env.OWNER_EMAIL
  const ownerPassword = process.env.OWNER_PASSWORD
  if (!ownerEmail || !ownerPassword) throw new Error('OWNER_EMAIL and OWNER_PASSWORD must be set to seed')
  await create('owner', { email: ownerEmail, password: ownerPassword })

  // Nothing else is created without an owner, in particular not the public demo login.
  if (!(await exists({ role: { equals: 'owner' } }))) throw new Error('Refusing to seed other users: no owner exists')

  const { DEMO_EMAIL, DEMO_PASSWORD, PREVIEW_API_KEY, SUBMITTER_API_KEY } = process.env
  if (DEMO_EMAIL && DEMO_PASSWORD) await create('demo', { email: DEMO_EMAIL, password: DEMO_PASSWORD })
  if (PREVIEW_API_KEY) await create('preview', { email: 'preview@cms.invalid', apiKey: PREVIEW_API_KEY })
  if (SUBMITTER_API_KEY) await create('submitter', { email: 'submitter@cms.invalid', apiKey: SUBMITTER_API_KEY })
}
