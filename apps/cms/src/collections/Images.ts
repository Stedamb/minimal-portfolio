import type { CollectionConfig } from 'payload'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isOwner } from '../access/roles'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Widths the site turns into a srcset; the height follows the crop around the focal point.
export const IMAGE_WIDTHS = [640, 1280, 1920, 2560] as const

export const Images: CollectionConfig = {
  slug: 'images',
  admin: { useAsTitle: 'alt', defaultColumns: ['filename', 'alt', 'credit'], group: 'Media' },
  access: {
    read: () => true,
    create: isOwner,
    update: isOwner,
    delete: isOwner,
  },
  upload: {
    // Used with local storage only; the Blob adapter replaces it in production (KTD10).
    staticDir: path.resolve(dirname, '../../media/images'),
    mimeTypes: ['image/*'],
    focalPoint: true,
    crop: true,
    adminThumbnail: 'w640',
    imageSizes: IMAGE_WIDTHS.map((width) => ({
      name: `w${width}`,
      width,
      withoutEnlargement: true,
      formatOptions: { format: 'webp' as const, options: { quality: 80 } },
    })),
  },
  fields: [
    { name: 'alt', type: 'text', required: true, localized: true },
    { name: 'credit', type: 'text' },
  ],
}
