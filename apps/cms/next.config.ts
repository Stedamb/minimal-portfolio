import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The e2e stack builds into its own folder, so it can run next to an open dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The shared package ships TypeScript source.
  transpilePackages: ['@repo/shared'],
  turbopack: { root: path.resolve(dirname, '../..') },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
