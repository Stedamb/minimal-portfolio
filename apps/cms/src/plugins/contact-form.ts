import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import type { Access, Endpoint } from 'payload'

import { hasRole, isOwner, isOwnerOrDemo } from '../access/roles'

// The CMS-defined contact form. Visitors never talk to Payload: the site's
// Astro Action does, with the `submitter` API key, after its own spam checks.

// Only the field kinds the site renders, so the owner can't add one the page would drop.
const FIELDS = {
  text: true,
  email: true,
  textarea: true,
  checkbox: false,
  country: false,
  date: false,
  message: false,
  number: false,
  payment: false,
  select: false,
  state: false,
  upload: false,
} as const

const isSubmitter: Access = ({ req }) => hasRole(req.user, 'submitter')

export const contactForm = () =>
  formBuilderPlugin({
    fields: FIELDS,
    formOverrides: {
      // The form definition is public (the site renders it); only the owner edits it. The
      // demo keeps `update` like the other content so the edit view opens, and the demo
      // guard rejects what it writes.
      access: { read: () => true, create: isOwner, update: isOwnerOrDemo, delete: isOwner },
      fields: ({ defaultFields }) => [
        {
          // Stable handle the site looks the form up by, so renaming the title can't break it.
          name: 'slug',
          type: 'text',
          required: true,
          unique: true,
          index: true,
          admin: { position: 'sidebar' },
        },
        ...defaultFields,
      ],
    },
    formSubmissionOverrides: {
      // Create only by the site's `submitter` key: anonymous and demo creates are denied, so
      // the Action's checks can't be bypassed with a direct post. Read and delete: owner.
      access: { create: isSubmitter, read: isOwner, update: () => false, delete: isOwner },
      fields: ({ defaultFields }) => [
        ...defaultFields,
        {
          // Salted hash of the client IP, used for the per-IP rate limit. Never shown to anyone
          // but the owner, and never returned to the submitter that wrote it.
          name: 'ipHash',
          type: 'text',
          index: true,
          admin: { readOnly: true, position: 'sidebar' },
          access: {
            create: ({ req }) => hasRole(req.user, 'submitter'),
            read: ({ req }) => hasRole(req.user, 'owner'),
            update: () => false,
          },
        },
      ],
    },
  })

const MAX_WINDOW_SECONDS = 3600

// GET /api/contact-rate?ipHash=<sha256 hex>&windowSeconds=<n>: how many submissions that
// hash made in the window. This is the whole capability the `submitter` has beyond create:
// a number, with no way to read a submission (the collection's read access stays owner-only).
export const contactRateEndpoint: Endpoint = {
  path: '/contact-rate',
  method: 'get',
  handler: async (req) => {
    if (!hasRole(req.user, 'submitter')) return Response.json({ error: 'Forbidden' }, { status: 403 })
    const params = new URL(req.url ?? 'http://localhost').searchParams
    const ipHash = params.get('ipHash') ?? ''
    const windowSeconds = Number(params.get('windowSeconds'))
    if (!/^[a-f0-9]{64}$/.test(ipHash) || !Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > MAX_WINDOW_SECONDS) {
      return Response.json({ error: 'Bad request' }, { status: 400 })
    }
    const { totalDocs } = await req.payload.count({
      collection: 'form-submissions',
      where: {
        and: [
          { ipHash: { equals: ipHash } },
          { createdAt: { greater_than: new Date(Date.now() - windowSeconds * 1000).toISOString() } },
        ],
      },
      overrideAccess: true,
    })
    return Response.json({ count: totalDocs })
  },
}
