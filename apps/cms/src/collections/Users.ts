import type { Access, CollectionConfig } from 'payload'

import { hasRole, isOwner, ROLES } from '../access/roles'

// The owner sees everyone, API-key service users see nothing, everyone else sees
// only their own document.
const readUsers: Access = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'owner')) return true
  if (hasRole(user, 'preview', 'submitter')) return false
  return { id: { equals: user.id } }
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'role'] },
  auth: { useAPIKey: true, maxLoginAttempts: 0 },
  access: {
    create: isOwner,
    read: readUsers,
    update: isOwner,
    delete: isOwner,
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      options: [...ROLES],
      // No default: a self-registered first user gets no role (KTD9).
      access: {
        create: ({ req }) => hasRole(req.user, 'owner'),
        update: ({ req }) => hasRole(req.user, 'owner'),
      },
      hooks: {
        // Field access is skipped when a caller overrides access, and the
        // create-first-user endpoint does exactly that. So only an owner, or a
        // trusted Local API caller (the seed) passing `context.assignRole`, may
        // write a role; anything else keeps the stored value, or none (null: an
        // undefined return would leave the submitted value untouched).
        beforeChange: [
          ({ req, value, operation, originalDoc }) => {
            if (hasRole(req.user, 'owner') || req.context.assignRole === true) return value
            return operation === 'create' ? null : (originalDoc?.role ?? null)
          },
        ],
      },
    },
  ],
}
