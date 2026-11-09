// Waits for the database, runs the idempotent seed, then starts cms and web.
// `cms` does not exist until U2 and `seed` until U3; both steps are skipped
// while missing (`--if-present`).
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

const dev = spawn('pnpm', ['--parallel', '--filter', 'cms', '--filter', 'web', '--if-present', 'dev'], opts)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => dev.kill(sig))
dev.on('exit', (code) => process.exit(code ?? 0))
