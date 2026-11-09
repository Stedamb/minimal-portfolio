import type { CollectionConfig } from 'payload'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isOwner, isOwnerOrDemo } from '../access/roles'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const Videos: CollectionConfig = {
  slug: 'videos',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'filename', 'mimeType'], group: 'Media' },
  access: {
    read: () => true,
    create: isOwner,
    update: isOwnerOrDemo,
    delete: isOwner,
  },
  upload: {
    staticDir: path.resolve(dirname, '../../media/videos'),
    mimeTypes: ['video/mp4', 'video/webm'],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'poster', type: 'upload', relationTo: 'images' },
    {
      // The site serves this WebM before the MP4 when it is set (R7). It is
      // another document of this collection, so no second upload field is needed.
      name: 'webm',
      type: 'relationship',
      relationTo: 'videos',
      filterOptions: ({ id }) => ({
        mimeType: { equals: 'video/webm' },
        ...(id ? { id: { not_equals: id } } : {}),
      }),
      admin: { description: 'Optional WebM version of this clip, served first by browsers that support it.' },
    },
  ],
}
