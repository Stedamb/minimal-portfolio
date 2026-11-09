import type { CollectionConfig } from 'payload'

import { readPublished } from '../access/published'
import { isOwner, isOwnerOrDemo } from '../access/roles'
import { projectLivePreview } from '../preview/live-preview'
import { capturePublishedProject, purgeProjectChange, purgeProjectDelete } from '../hooks/purge'

export const Projects: CollectionConfig = {
  slug: 'projects',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'client', 'order', '_status', 'updatedAt'],
    livePreview: projectLivePreview,
  },
  defaultSort: 'order',
  lockDocuments: false,
  hooks: { beforeChange: [capturePublishedProject], afterChange: [purgeProjectChange], afterDelete: [purgeProjectDelete] },
  versions: {
    maxPerDoc: 50,
    drafts: { autosave: true, schedulePublish: true },
  },
  access: {
    read: readPublished,
    create: isOwner,
    update: isOwnerOrDemo,
    delete: isOwner,
    readVersions: ({ req: { user } }) => Boolean(user),
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    // One slug across languages keeps ids, cache tags and the language switch simple.
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'client', type: 'text', required: true },
    { name: 'role', type: 'text', localized: true },
    { name: 'date', type: 'text', admin: { description: 'Free text, for example "2018-2022".' } },
    { name: 'preview', type: 'textarea', localized: true, admin: { description: 'Short teaser shown on the homepage cards.' } },
    { name: 'description', type: 'textarea', localized: true },
    { name: 'credits', type: 'textarea', localized: true },
    {
      name: 'externalLink',
      type: 'group',
      fields: [
        { name: 'label', type: 'text', localized: true },
        { name: 'href', type: 'text' },
      ],
    },
    { name: 'featured', type: 'checkbox', defaultValue: false },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: { position: 'sidebar', description: 'Lower numbers come first on the site.' },
    },
    {
      // The first item is the cover on the homepage and the portfolio.
      name: 'items',
      type: 'blocks',
      required: true,
      minRows: 1,
      blocks: [
        {
          slug: 'photo',
          labels: { singular: 'Photo', plural: 'Photos' },
          fields: [
            { name: 'image', type: 'upload', relationTo: 'images', required: true },
            { name: 'caption', type: 'text', localized: true },
          ],
        },
        {
          slug: 'video',
          // Without this the block's GraphQL type (Video) collides with the videos collection's.
          graphQL: { singularName: 'ProjectVideoBlock' },
          labels: { singular: 'Video', plural: 'Videos' },
          fields: [{ name: 'video', type: 'upload', relationTo: 'videos', required: true }],
        },
      ],
    },
  ],
}
