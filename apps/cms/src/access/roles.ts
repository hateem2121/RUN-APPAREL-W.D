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

/**
 * Field-level "signed in", for fields on an otherwise PUBLIC collection.
 *
 * `Media.access.read` is deliberately `() => true` — posters and models render on
 * the public viewer. But "the collection is public" was read as "every field on it
 * is public", and three internal review fields rode along: measured 2026-08-30,
 * an unauthenticated `GET /api/media` returned all 21 documents including
 * `artworkVerdict`, `artworkOverrideReason` and `sizeWarning` — the QA verdict on a
 * garment's printed artwork, the reason someone published a damaged one anyway, and
 * an internal size flag.
 *
 * Deliberately NOT `isAdminFieldLevel`: the shrink robot authenticates as a user via
 * `users API-Key`, and pinning these to admin would break it the moment it ever needs
 * to read one back. It currently only writes them, which is exactly the kind of thing
 * that changes quietly.
 */
export const isAuthenticatedFieldLevel: FieldAccess = ({ req }) => Boolean(req.user)
