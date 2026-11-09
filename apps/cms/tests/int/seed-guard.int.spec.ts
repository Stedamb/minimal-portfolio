import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { assertNoExampleSecrets } from '../../src/seed/users'

const example = parseEnv(readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8'))
const remote = 'postgres://user:pass@db.example.com:5432/app'

describe('seed guard', () => {
  it('allows the example credentials on a local database', () => {
    expect(() => assertNoExampleSecrets({ ...example })).not.toThrow()
  })

  it('refuses the example credentials on a remote database', () => {
    expect(() => assertNoExampleSecrets({ ...example, DATABASE_URL: remote })).toThrow(/OWNER_PASSWORD/)
  })

  it('allows a remote database once every secret is replaced', () => {
    const env = {
      DATABASE_URL: remote,
      OWNER_PASSWORD: 'a-real-owner-password',
      DEMO_PASSWORD: 'a-real-demo-password',
      PREVIEW_API_KEY: 'a-real-preview-key',
      SUBMITTER_API_KEY: 'a-real-submitter-key',
    }
    expect(() => assertNoExampleSecrets(env)).not.toThrow()
  })
})
