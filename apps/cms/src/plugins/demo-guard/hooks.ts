import { APIError } from 'payload'
import type { CollectionBeforeOperationHook, CollectionBeforeValidateHook, GlobalBeforeOperationHook } from 'payload'

import { isReadOnlyRole } from '../../access/roles'
import { demoMessage } from './messages'

// `autosave` is not a separate hook operation in 3.93 (it arrives as `update`), but it
// is listed so the guard keeps covering it if Payload ever splits it out.
const WRITE_OPERATIONS = new Set(['create', 'update', 'autosave', 'delete', 'restoreVersion'])

type Req = Parameters<CollectionBeforeOperationHook>[0]['req']

export const demoError = (req: Pick<Req, 'i18n'>) => new APIError(demoMessage(req.i18n?.language), 403, undefined, true)

// Writes with no user (first-user registration, the seed, forgot/reset password,
// submissions by an API key that is not a read-only role) fall through to access control.
export const rejectDemoWrites: CollectionBeforeOperationHook & GlobalBeforeOperationHook = ({ operation, req }) => {
  if (WRITE_OPERATIONS.has(operation) && isReadOnlyRole(req.user)) throw demoError(req)
}

// The schedule handler queues its job with no `req`, so the guard above can't see
// who asked. The job input carries the user instead.
export const rejectDemoScheduledJob: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  const ref = (data as { input?: { user?: { relationTo?: string; value?: number | string } } } | undefined)?.input?.user
  if (operation === 'create' && ref?.relationTo && ref.value !== undefined) {
    const user = await req.payload.findByID({
      collection: ref.relationTo as 'users',
      id: ref.value,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req,
    })
    if (isReadOnlyRole(user as { role?: string } | null)) throw demoError(req)
  }
  return data
}
