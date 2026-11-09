import type { GlobalConfig } from 'payload'

import { readPublished } from '../access/published'
import { isOwnerOrDemo } from '../access/roles'
import { purgeProfileChange } from '../hooks/purge'

export const Profile: GlobalConfig = {
  slug: 'profile',
  lockDocuments: false,
  hooks: { afterChange: [purgeProfileChange] },
  versions: {
    max: 50,
    drafts: { autosave: true, schedulePublish: true },
  },
  access: {
    read: readPublished,
    update: isOwnerOrDemo,
    readVersions: ({ req: { user } }) => Boolean(user),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'role', type: 'text', localized: true },
    { name: 'bio', type: 'textarea', localized: true },
    { name: 'photo', type: 'upload', relationTo: 'images' },
    { name: 'hero', type: 'upload', relationTo: ['images', 'videos'], admin: { description: 'Image or video shown in the homepage hero.' } },
    {
      name: 'clients',
      type: 'array',
      admin: { description: 'Names scrolling in the homepage marquee.' },
      fields: [{ name: 'name', type: 'text', required: true }],
    },
    {
      name: 'contact',
      type: 'group',
      fields: [
        { name: 'email', type: 'email' },
        { name: 'phone', type: 'text' },
        { name: 'instagram', type: 'text' },
      ],
    },
  ],
}
