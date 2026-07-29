import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    // Brute-force protection for the admin login: lock an account for 10
    // minutes after 5 consecutive failed attempts. Built into Payload — no
    // extra infrastructure. (A Cloudflare rate-limit rule on the login route
    // is documented as an optional extra layer in docs/CLOUDFLARE-SETUP.md.)
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    // Allow API-key auth so the shrink robot (apps/shrink) can create the
    // guardrailed Media doc and update the raw-upload record after processing.
    // Give the robot user the Editor role and enable its key on its user record;
    // keys are per-user and revocable. Humans still sign in with email/password.
    useAPIKey: true,
  },
  // Auth collections are the one place Payload v4 still defaults `versions` to
  // false, but stating it keeps every collection in this config consistent.
  versions: false,
  admin: {
    useAsTitle: 'email',
    group: 'System',
    // Editors can only ever read their own record; showing them a "Users" entry
    // that lists one person is noise. Keeps the editor sidebar to three items.
    hidden: ({ user }) => (user as { role?: string } | null | undefined)?.role !== 'admin',
  },
  access: {
    // Only Admin / Director manages users. Editors may read their own record
    // (needed for the admin UI session) but no one else's.
    create: isAdmin,
    read: ({ req }) => {
      if (!req.user) return false
      if (req.user.role === 'admin') return true
      return { id: { equals: req.user.id } }
    },
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: 'Admin / Director', value: 'admin' },
        { label: 'Editor', value: 'editor' },
      ],
      access: {
        // Editors can never change roles (their own or anyone's).
        create: ({ req }) => req.user?.role === 'admin',
        update: ({ req }) => req.user?.role === 'admin',
      },
      admin: {
        description:
          'Admin / Director: full control including users and configuration. Editor: manages products, colourways and media only.',
      },
    },
  ],
}
