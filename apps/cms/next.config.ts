import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript source.
  transpilePackages: ['@repo/shared'],
  turbopack: { root: path.resolve(dirname, '../..') },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
