import type { CollectionConfig } from 'payload'
import { isAdmin, isSignedInPerson } from '../access/roles'
import { APPLICATION_UPLOAD_MIME_TYPES } from '../lib/applicationFileTypes'

/**
 * The CV an applicant attached to the careers form (owner, F23, 2026-10-07: one file, kept with
 * its application for 12 months).
 *
 * ⚠️ THE SAME CLOSED POSTURE AS `InquiryFiles`, FOR THE SAME REASON. `create` and `update` are
 * closed to everyone: the careers route writes with the local API and `overrideAccess: true`
 * only after it has checked the file's bytes, the honeypot and the rate limit. An open `create`
 * would put an anonymous upload endpoint on the internet.
 *
 * ⚠️ A CV IS NEVER SERVED FROM A PUBLIC ADDRESS. It lives in the PRIVATE inquiry bucket under
 * `careers/`, and that storage instance in `payload.config.ts` has NO `generateFileURL` and NO
 * `disablePayloadAccessControl`, so every download goes through
 * `/api/application-files/file/<name>`, which checks `read` below first.
 *
 * ⚠️ AND IT ALWAYS DOWNLOADS, NEVER OPENS IN THE ADMIN'S TAB: a stranger chose these bytes.
 */
export const ApplicationFiles: CollectionConfig = {
  slug: 'application-files',
  labels: { singular: 'Application file', plural: 'Application files' },
  access: {
    read: isSignedInPerson,
    create: () => false,
    update: () => false,
    // Deleting the application deletes its file (`JobApplications` hooks); this is for one file.
    delete: isAdmin,
  },
  admin: {
    group: 'Content',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'application', 'filesize', 'createdAt'],
    description:
      'CVs sent with job applications. Each belongs to one application and is deleted with it. They download to your computer rather than opening here, because anyone can send one.',
  },
  upload: {
    mimeTypes: [...APPLICATION_UPLOAD_MIME_TYPES],
    // No image editing: these are the applicant's originals, and Workers have no `sharp`.
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
      name: 'application',
      type: 'relationship',
      relationTo: 'job-applications',
      // NOT `required`, deliberately — the same reason as `InquiryFiles.inquiry`: a NOT NULL
      // column would make deleting an application fail before its file could be removed.
      admin: { readOnly: true },
    },
  ],
}
