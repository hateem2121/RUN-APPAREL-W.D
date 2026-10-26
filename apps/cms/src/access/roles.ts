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

/**
 * A person signed in through the admin, never an API key. The shrink robot signs in with
 * `users API-Key`, so `isAuthenticated` let its key read every customer's name, email and
 * message (audit 2026-09-26) — data it has no use for.
 */
export const isSignedInPerson: Access = ({ req }) =>
  Boolean(req.user) && (req.user as { _strategy?: string })._strategy !== 'api-key'

/**
 * An ADMIN signed in as a person: `isAdmin` and `isSignedInPerson` together.
 *
 * WHY (2026-10-26). The shrink robot's user has the ADMIN role, because deleting media is
 * admin-only and the robot deletes the unused models it leaves behind (`orphanGuard.ts`,
 * `index.ts` in apps/shrink). So `isAdmin` alone let the robot's key, a Cloudflare secret,
 * read the PDF visitors' city, country and device (DocumentVisits), the weekly email log and
 * site events. Nothing reads those by key: every reader is the CMS's own Local API code,
 * which bypasses access. The owner chose people-only reads that day.
 */
export const isAdminPerson: Access = (args) =>
  Boolean(isAdmin(args)) && Boolean(isSignedInPerson(args))

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
