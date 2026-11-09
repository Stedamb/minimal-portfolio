import { defineConfig } from '@playwright/test'

import base from './playwright.config'

// Records the editing walkthrough used in the README: `pnpm --filter cms record:demo`.
// Same stack, ports and seeded data as the e2e suite, but only the recording script runs.
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: '**/record-demo.e2e.ts',
  timeout: 180_000,
})
