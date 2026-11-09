import { defineConfig } from 'vitest/config'

// The PGlite socket serves a single database, so the suite isolates itself in
// its own Postgres schema (`cms_test`) and lets Payload push the schema there.
// The schema is dropped in afterAll; the dev data in `public` is never touched.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/int/**/*.int.spec.ts'],
    env: { DATABASE_SCHEMA: 'cms_test', DATABASE_PUSH: 'true' },
    hookTimeout: 120_000,
    testTimeout: 60_000,
    fileParallelism: false,
  },
})
