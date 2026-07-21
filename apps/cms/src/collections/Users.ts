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
  },
  admin: {
    useAsTitle: 'email',
    group: 'System',
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
