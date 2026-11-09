// Loads the root `.env`, or `.env.example` on a fresh clone, into process.env.
// Variables already set in the shell win.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const file = ['.env', '.env.example'].map((f) => new URL(f, root)).find((u) => existsSync(u))
if (file) process.loadEnvFile(fileURLToPath(file))

export const rootDir = fileURLToPath(root)
