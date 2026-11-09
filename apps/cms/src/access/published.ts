import type { Access } from 'payload'

import { hasRole } from './roles'

// Anonymous visitors see published documents only. Signed-in staff (owner, the
// demo account, the preview API key) also see drafts (KTD9).
export const readPublished: Access = ({ req: { user } }) =>
  hasRole(user, 'owner', 'demo', 'preview') ? true : { _status: { equals: 'published' } }
