import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Images } from './collections/Images'
import { Projects } from './collections/Projects'
import { Users } from './collections/Users'
import { Videos } from './collections/Videos'
import { Profile } from './globals/Profile'
import { clientUploadAccess, demoGuard } from './plugins/demo-guard'
import { contactForm, contactRateEndpoint } from './plugins/contact-form'
import { mcp } from './plugins/mcp'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Origin only, no path. Locally the default dev URL; on Vercel set in the project.
const serverURL = process.env.CMS_URL || 'http://localhost:3000'
// Preview deployments run on their own *.vercel.app URL, so cookie requests from there are accepted too.
const trustedOrigins = [serverURL, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`].filter(
  (origin): origin is string => Boolean(origin),
)

if (!process.env.PAYLOAD_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('PAYLOAD_SECRET must be set in production')
}

export default buildConfig({
  serverURL,
  // Only these origins may make cookie-authenticated requests (the admin). The site talks to
  // the API server-to-server with API keys, which this check does not apply to.
  csrf: trustedOrigins,
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
  },
  collections: [Users, Projects, Images, Videos],
  globals: [Profile],
  endpoints: [contactRateEndpoint],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    // Schema changes ship as committed migrations, never dev push.
    // The integration tests opt in to push inside their own schema.
    push: process.env.DATABASE_PUSH === 'true',
    schemaName: process.env.DATABASE_SCHEMA || undefined,
  }),
  // Vercel runs scheduled publishes from a Vercel Schedule (vercel.json); everywhere else
  // the app polls itself every minute. Tests drive the queue by hand.
  jobs: {
    autoRun: process.env.VERCEL || process.env.NODE_ENV === 'test' ? [] : [{ cron: '* * * * *', limit: 10 }],
  },
  localization: {
    locales: [
      { code: 'it', label: 'Italiano' },
      { code: 'en', label: 'English' },
    ],
    defaultLocale: 'it',
    fallback: true,
  },
  plugins: [
    // With no token the adapter disables itself and Payload stores files in `media/`.
    // Media is public (read: () => true), so file URLs point straight at the Blob CDN
    // instead of streaming every image and video through a CMS function.
    vercelBlobStorage({
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      collections: { images: { disablePayloadAccessControl: true }, videos: { disablePayloadAccessControl: true } },
      token: process.env.BLOB_READ_WRITE_TOKEN,
      alwaysInsertFields: true,
      clientUploads: { access: clientUploadAccess },
    }),
    contactForm(),
    mcp(),
    // Last, so it also covers whatever earlier plugins add (forms, MCP keys, ...).
    demoGuard(),
  ],
  secret: process.env.PAYLOAD_SECRET || '',
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
