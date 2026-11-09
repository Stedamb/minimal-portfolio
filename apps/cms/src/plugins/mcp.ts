import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { UnauthorizedError } from 'payload'

import { hasRole, isOwner } from '../access/roles'

// MCP endpoint at POST /api/mcp (KTD12, R21, R22). Owner-only: key management is limited to
// the owner, and a key is refused unless the user it belongs to is the owner. Tools run the
// Local API with overrideAccess: false, so the access rules and the demo guard apply too.
// Delete is not enabled for anything. Each key also carries per-tool checkboxes (all off by
// default) that the owner ticks when creating it.

const CONTENT_HINT =
  'Text fields marked localized hold one value per language: it (Italian, the default) and en (English, falls back to Italian). ' +
  'Pass `locale: "en"` to read or write the English value; without it the Italian one is used. ' +
  'Always pass `draft: true` when creating or updating, so nothing goes live until the owner publishes it in the admin.'

export const mcp = () =>
  mcpPlugin({
    collections: {
      projects: {
        enabled: { find: true, create: true, update: true, delete: false },
        description:
          `A photography/video project shown on the portfolio. ${CONTENT_HINT} ` +
          'The slug is not localized and must be unique. `items` is an ordered list of photo and video blocks that reference media by id; ' +
          'the FIRST item is the project cover on the homepage and the portfolio. `order` sorts projects (lower first). Projects have drafts and versions.',
      },
      images: {
        enabled: { find: true, create: true, update: true, delete: false },
        description: `An uploaded photo. Use find to look up ids for project items. ${CONTENT_HINT} The alt text is localized.`,
      },
      videos: {
        enabled: { find: true, create: true, update: true, delete: false },
        description: `An uploaded video. Use find to look up ids for project items. ${CONTENT_HINT}`,
      },
    },
    globals: {
      profile: {
        enabled: { find: true, update: true },
        description:
          `The photographer's profile: name, role, bio, photo, homepage hero, clients marquee and contact details. ${CONTENT_HINT} Profile has drafts too.`,
      },
    },
    overrideApiKeyCollection: (collection) => ({
      ...collection,
      access: { ...collection.access, create: isOwner, read: isOwner, update: isOwner, delete: isOwner, unlock: isOwner },
      admin: {
        ...collection.admin,
        // Keys are owner business; everyone else doesn't see the collection at all.
        hidden: ({ user }) => !hasRole(user as { role?: string }, 'owner'),
      },
    }),
    overrideAuth: async (_req, getDefaultMcpAccessSettings) => {
      const settings = await getDefaultMcpAccessSettings()
      const user = settings.user as { role?: string } | string | number | null | undefined
      if (!user || typeof user !== 'object' || !hasRole(user, 'owner')) throw new UnauthorizedError()
      return settings
    },
  })
