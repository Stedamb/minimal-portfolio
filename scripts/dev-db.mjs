// Local Postgres without Docker: PGlite persisted to a git-ignored directory
// and exposed over the Postgres wire protocol.
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { resolve } from 'node:path'
import { rootDir } from './load-env.mjs'

const port = Number(process.env.PGLITE_PORT ?? 5432)
const dataDir = resolve(rootDir, process.env.PGLITE_DATA_DIR ?? '.pglite')

const db = await PGlite.create(dataDir)
const server = new PGLiteSocketServer({ db, port, host: 'localhost', maxConnections: 10 })
await server.start()
console.log(`PGlite listening on postgres://postgres:postgres@localhost:${port}/postgres (data: ${dataDir})`)

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await server.stop()
  await db.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
