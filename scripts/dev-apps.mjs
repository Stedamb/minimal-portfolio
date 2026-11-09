// Waits for the database, runs the idempotent seed, then starts cms and web.
import { spawn, spawnSync } from 'node:child_process'
import { connect } from 'node:net'
import { rootDir } from './load-env.mjs'

const { hostname, port } = new URL(process.env.DATABASE_URL)

function canConnect() {
  return new Promise((ok) => {
    const s = connect({ host: hostname, port: Number(port) || 5432 })
    s.once('connect', () => (s.destroy(), ok(true)))
    s.once('error', () => ok(false))
  })
}

for (let i = 0; !(await canConnect()); i++) {
  if (i === 60) throw new Error(`Database not reachable at ${hostname}:${port}`)
  await new Promise((r) => setTimeout(r, 500))
}

const opts = { cwd: rootDir, stdio: 'inherit' }
const seed = spawnSync('pnpm', ['--filter', 'cms', '--if-present', 'seed'], opts)
if (seed.status !== 0) process.exit(seed.status ?? 1)

// The CMS dev script reads its port from CMS_PORT; derive it from CMS_URL.
const cmsPort = process.env.CMS_URL ? new URL(process.env.CMS_URL).port : ''
const env = { ...process.env, ...(cmsPort ? { CMS_PORT: cmsPort } : {}) }

const dev = spawn('pnpm', ['--parallel', '--filter', 'cms', '--filter', 'web', '--if-present', 'dev'], { ...opts, env })
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => dev.kill(sig))
dev.on('exit', (code) => process.exit(code ?? 0))
