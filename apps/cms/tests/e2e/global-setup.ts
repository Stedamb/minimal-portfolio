import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

// Starts the local stack the way a visitor would, with the root command, and waits for both apps.
// The first request compiles each app, so the wait is generous.
const root = resolve(import.meta.dirname, '../../../..')
const READY_TIMEOUT_MS = 5 * 60_000

async function waitFor(url: string, stack: ReturnType<typeof spawn>, log: () => string) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (stack.exitCode !== null) throw new Error(`The stack exited early (code ${stack.exitCode}):\n${log()}`)
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status < 500) return
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`${url} did not come up in time:\n${log()}`)
}

export default async function globalSetup() {
  // `astro dev` daemonizes when it detects an agent; the stack must stay in the foreground.
  const env = { ...process.env }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  // The stack runs on its own ports, so it may start next to a dev server the developer already has open.
  env.ASTRO_DEV_FLAGS = '--ignore-lock'
  env.NEXT_DIST_DIR = '.next-e2e'

  let output = ''
  const stack = spawn('pnpm', ['dev'], { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const collect = (chunk: Buffer) => (output = (output + chunk).slice(-8000))
  stack.stdout?.on('data', collect)
  stack.stderr?.on('data', collect)

  const stop = async () => {
    if (stack.exitCode === null && stack.pid) {
      const exited = new Promise((done) => stack.once('exit', done))
      try {
        process.kill(-stack.pid, 'SIGTERM')
      } catch {}
      await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))])
      try {
        process.kill(-stack.pid, 'SIGKILL')
      } catch {}
    }
    rmSync(process.env.PGLITE_DATA_DIR!, { recursive: true, force: true })
  }

  try {
    await waitFor(`${process.env.CMS_URL}/admin/login`, stack, () => output)
    await waitFor(`${process.env.WEB_URL}/`, stack, () => output)
  } catch (error) {
    await stop()
    throw error
  }
  return stop
}
