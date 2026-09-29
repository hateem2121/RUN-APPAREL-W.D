import type { CollectionConfig } from 'payload'
import { isAdmin, isSignedInPerson } from '../access/roles'
import { INQUIRY_UPLOAD_MIME_TYPES } from '../lib/inquiryFileTypes'

/**
 * Files a buyer attached to a contact-form inquiry (owner, 2026-09-29: up to 5 files,
 * 25 MB in total, kept until the inquiry is deleted).
 *
 * ⚠️ THE SAME CLOSED POSTURE AS `Inquiries`, FOR THE SAME REASON. `create` and `update` are
 * closed to everyone: the contact route writes with the local API and `overrideAccess: true`
 * only after it has checked each file's bytes (`lib/inquiryFiles.ts`), the honeypot and the
 * rate limit. An open `create` would put an anonymous upload endpoint on the internet.
 *
 * ⚠️ A FILE IS NEVER SERVED FROM A PUBLIC ADDRESS. The bucket has no custom domain and its
 * r2.dev address is off (read back 2026-09-29), and this collection's storage instance in
 * `payload.config.ts` has NO `generateFileURL` and NO `disablePayloadAccessControl`, so every
 * download goes through `/api/inquiry-files/file/<name>`, which checks `read` below first.
 * `Media` does the opposite on purpose; copying its storage settings here would publish
 * customers' tech packs.
 *
 * ⚠️ AND IT ALWAYS DOWNLOADS, NEVER OPENS IN THE ADMIN'S TAB. A buyer chooses these bytes. A
 * PDF or an image rendered inline on `cms.wear-run.help` runs in the admin's origin, so
 * `modifyResponseHeaders` forces `Content-Disposition: attachment` and `nosniff`.
 */
export const InquiryFiles: CollectionConfig = {
  slug: 'inquiry-files',
  labels: { singular: 'Inquiry file', plural: 'Inquiry files' },
  access: {
    read: isSignedInPerson,
    create: () => false,
    update: () => false,
    // Deleting the inquiry deletes its files (`Inquiries` hooks); this is for a single file.
    delete: isAdmin,
  },
  admin: {
    group: 'Content',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'inquiry', 'filesize', 'createdAt'],
    description:
      'Files buyers attached to the contact form. Each belongs to one inquiry and is deleted with it. They download to your computer rather than opening here, because anyone can send one.',
  },
  upload: {
    mimeTypes: [...INQUIRY_UPLOAD_MIME_TYPES],
    // No image editing: these are the buyer's originals, and Workers have no `sharp`.
    crop: false,
    focalPoint: false,
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Content-Disposition', 'attachment')
      headers.set('X-Content-Type-Options', 'nosniff')
      headers.set('Cache-Control', 'private, no-store')
      return headers
    },
  },
  fields: [
    {
      name: 'inquiry',
      type: 'relationship',
      relationTo: 'inquiries',
      /*
       * ⚠️ NOT `required`, DELIBERATELY. Payload's column is `ON DELETE set null`; a NOT NULL
       * column would make deleting an inquiry fail at the database before the hook that
       * removes its files could run (D1 has no transaction to roll the two back together).
       * Nullable, the inquiry goes first and its files follow; if that second step ever
       * failed, the file shows here with no inquiry, in plain sight, rather than blocking.
       */
      admin: { readOnly: true },
    },
  ],
}
