import { defineConfig } from '@playwright/test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// The suite starts the whole stack with the root `pnpm dev` (see tests/e2e/stack.ts) on its own
// ports and a fresh PGlite directory, so it never touches the dev database or a running dev server.
// The config is evaluated once in the runner before workers start, so the values below are shared.
process.env.CMS_URL ??= 'http://localhost:3300'
process.env.WEB_URL ??= 'http://localhost:4400'
process.env.PGLITE_PORT ??= '5532'
process.env.DATABASE_URL ??= `postgres://postgres:postgres@localhost:${process.env.PGLITE_PORT}/postgres`
process.env.PGLITE_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'portfolio-e2e-'))

// Credentials and secrets come from the root `.env`, or `.env.example` on a fresh clone. Variables
// set above or in the shell win.
const rootEnv = ['.env', '.env.example'].map((f) => resolve(import.meta.dirname, '../..', f)).find(existsSync)
if (rootEnv) process.loadEnvFile(rootEnv)

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  // One stack, one database: tests run in order.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.CMS_URL,
    headless: true,
    trace: 'retain-on-failure',
  },
})
