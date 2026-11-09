import type { Access } from 'payload'

export const ROLES = ['owner', 'demo', 'preview', 'submitter'] as const
export type Role = (typeof ROLES)[number]

type WithRole = { role?: string | null } | null | undefined

export const hasRole = (user: WithRole, ...roles: Role[]): boolean =>
  Boolean(user?.role && (roles as string[]).includes(user.role))

export const isOwner: Access = ({ req }) => hasRole(req.user, 'owner')
export const isDemo: Access = ({ req }) => hasRole(req.user, 'demo')
