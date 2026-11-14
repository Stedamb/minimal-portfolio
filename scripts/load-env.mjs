// Loads the root `.env`, or `.env.example` on a fresh local clone, into process.env.
// Variables already set in the shell win.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
// On Vercel every variable comes from the project settings: never fall back to
// the example file, so a missing secret fails loudly instead of using a local default.
const candidates = process.env.VERCEL ? ['.env'] : ['.env', '.env.example']
const file = candidates.map((f) => new URL(f, root)).find((u) => existsSync(u))
if (file) process.loadEnvFile(fileURLToPath(file))

export const rootDir = fileURLToPath(root)
