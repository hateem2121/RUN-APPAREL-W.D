import type { CollectionConfig } from 'payload'

/**
 * The daily secret `visitorCode` (Task 5) is built from. No access for anyone through
 * the API — only the documents Worker's own SQL reads and writes it — and hidden from
 * the admin nav, because it holds nothing an owner would ever need to look at.
 */
export const DocumentVisitSalts: CollectionConfig = {
  slug: 'document-visit-salts',
  versions: false,
  admin: { group: 'System', hidden: true },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'day', type: 'text', required: true, unique: true },
    { name: 'salt', type: 'text', required: true },
  ],
}
