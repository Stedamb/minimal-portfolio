import type { Access } from 'payload'

export const ROLES = ['owner', 'demo', 'preview', 'submitter'] as const
export type Role = (typeof ROLES)[number]

// Any principal: a user, or an MCP API key row (which has no role and so never matches).
type WithRole = object | null | undefined

export const hasRole = (user: WithRole, ...roles: Role[]): boolean =>
  Boolean((user as { role?: string | null } | null | undefined)?.role && (roles as string[]).includes((user as { role: string }).role))

export const isOwner: Access = ({ req }) => hasRole(req.user, 'owner')
export const isDemo: Access = ({ req }) => hasRole(req.user, 'demo')

// The demo account keeps `update` on content so fields stay editable and live
// preview works; the demo guard rejects what it actually tries to write.
export const isOwnerOrDemo: Access = ({ req }) => hasRole(req.user, 'owner', 'demo')

// Principals whose writes the demo guard always refuses.
export const isReadOnlyRole = (user: WithRole): boolean => hasRole(user, 'demo', 'preview')
