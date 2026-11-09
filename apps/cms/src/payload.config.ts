import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Users } from './collections/Users'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
  },
  collections: [Users],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    // Schema changes ship as committed migrations (KTD4), never dev push.
    // The integration tests opt in to push inside their own schema.
    push: process.env.DATABASE_PUSH === 'true',
    schemaName: process.env.DATABASE_SCHEMA || undefined,
  }),
  localization: {
    locales: [
      { code: 'it', label: 'Italiano' },
      { code: 'en', label: 'English' },
    ],
    defaultLocale: 'it',
    fallback: true,
  },
  plugins: [
    // Upload collections (images, videos) are listed here by U3. With no token
    // the adapter disables itself and Payload stores files in `media/`.
    vercelBlobStorage({
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      collections: {},
      token: process.env.BLOB_READ_WRITE_TOKEN,
      alwaysInsertFields: true,
      clientUploads: true,
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || '',
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
