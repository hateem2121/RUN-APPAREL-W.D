import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/roles'

/**
 * One row per Monday–Sunday week — the weekly-email guard and its outcome (Task 8).
 * Admins may read it (Task 9's summary box shows "Last weekly email" from the newest
 * row); hidden from the admin nav because nobody edits it by hand.
 */
export const DocumentVisitEmails: CollectionConfig = {
  slug: 'document-visit-emails',
  versions: false,
  admin: { group: 'System', hidden: true },
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'week', type: 'text', required: true, unique: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: [
        { label: 'Sent', value: 'sent' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    { name: 'sentAt', type: 'date' },
    { name: 'error', type: 'text' },
  ],
}
