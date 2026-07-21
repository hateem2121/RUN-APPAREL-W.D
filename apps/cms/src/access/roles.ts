import type { Access, FieldAccess } from 'payload'

export type Role = 'admin' | 'editor'

const roleOf = (user: unknown): Role | null => {
  if (user && typeof user === 'object' && 'role' in user) {
    const role = (user as { role?: unknown }).role
    if (role === 'admin' || role === 'editor') return role
  }
  return null
}

/** Admin / Director: full control. */
export const isAdmin: Access = ({ req }) => roleOf(req.user) === 'admin'

/** Editors can create/edit content; admins can do everything. */
export const isAdminOrEditor: Access = ({ req }) => {
  const role = roleOf(req.user)
  return role === 'admin' || role === 'editor'
}

/** No anonymous access — the public reads only via the dedicated viewer endpoint. */
export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

export const isAdminFieldLevel: FieldAccess = ({ req }) => roleOf(req.user) === 'admin'
