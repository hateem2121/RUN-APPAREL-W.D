import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/roles'

/**
 * First-party viewer telemetry sink — analytics events, diagnostics and
 * client errors from the public viewer. Rows are written ONLY by the public
 * `/api/public/events` endpoint (Local API, overrideAccess), never through the
 * admin/REST API — hence create and update are closed. Admins read and prune.
 *
 * Deliberately stores NO IP address and NO personal data — only a coarse,
 * length-capped user-agent string and the named event plus product/variant
 * context. This is the single consumer of the viewer's analytics seam.
 */
export const Events: CollectionConfig = {
  slug: 'events',
  // See Products.ts — pinned against Payload v4 flipping the default to ON.
  // Especially unwanted here: this is the highest-volume table in the database.
  versions: false,
  admin: {
    group: 'System',
    // Admin-only to read anyway; hiding it keeps the editor's sidebar to three.
    hidden: ({ user }) => (user as { role?: string } | null | undefined)?.role !== 'admin',
    useAsTitle: 'event',
    defaultColumns: ['type', 'event', 'product', 'variant', 'createdAt'],
    description:
      'Anonymous viewer analytics, diagnostics and client errors. No IP or personal data is stored. Written only by the public events endpoint; prune periodically.',
  },
  access: {
    read: isAdmin,
    create: () => false, // endpoint-only via the Local API (overrideAccess)
    update: () => false,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Analytics', value: 'analytics' },
        { label: 'Diagnostic', value: 'diagnostic' },
        { label: 'Error', value: 'error' },
      ],
    },
    { name: 'event', type: 'text', required: true, index: true },
    { name: 'product', type: 'text' },
    { name: 'variant', type: 'text' },
    { name: 'placement', type: 'text' },
    { name: 'message', type: 'text', admin: { description: 'Client error message (errors only).' } },
    { name: 'ua', type: 'text', admin: { description: 'Coarse, truncated user-agent. No IP is stored.' } },
  ],
}
