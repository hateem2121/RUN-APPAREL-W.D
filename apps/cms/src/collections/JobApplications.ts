import type {
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
} from 'payload'
import { isAdmin, isSignedInPerson } from '../access/roles'

/*
 * ⚠️ AN APPLICATION'S CV GOES WITH IT, IN TWO HALVES — copied from `Inquiries.ts`, which says
 * why: the file rows are found BEFORE the delete (the database nulls their `application` column
 * as the row goes), and deleted AFTER it, so a failed delete leaves the CV with its application.
 * Deleting each through Payload is what removes the object from R2 too.
 */
const FILES_TO_DELETE = 'applicationFilesToDelete'

export const rememberApplicationFilesToDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { docs } = await req.payload.find({
    collection: 'application-files',
    where: { application: { equals: id } },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const pending = (req.context[FILES_TO_DELETE] ?? {}) as Record<string, (string | number)[]>
  pending[String(id)] = docs.map((doc) => doc.id)
  req.context[FILES_TO_DELETE] = pending
}

export const deleteRememberedApplicationFiles: CollectionAfterDeleteHook = async ({ id, req }) => {
  const pending = (req.context[FILES_TO_DELETE] ?? {}) as Record<string, (string | number)[]>
  for (const fileId of pending[String(id)] ?? []) {
    await req.payload.delete({
      collection: 'application-files',
      id: fileId,
      overrideAccess: true,
      req,
    })
  }
  delete pending[String(id)]
}

/** Kept for 12 months, then the owner deletes it (F23, 2026-10-07). */
export const KEEP_DAYS = 365

type DeleteAfterArgs = {
  data: Record<string, unknown>
  operation: string
  originalDoc?: Record<string, unknown>
  /** For tests only; Payload never passes it. */
  now?: Date
}

/**
 * ⚠️ SET ONCE, AT RECEIPT, AND NEVER MOVED. A later save (a status change) keeps the date the
 * application arrived with, so marking one "reviewed" cannot quietly keep it another year.
 */
export const setDeleteAfter = ({ data, operation, originalDoc, now }: DeleteAfterArgs) => {
  if (operation === 'create') {
    const at = now ?? new Date()
    data.deleteAfter = new Date(at.getTime() + KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString()
  } else if (originalDoc && 'deleteAfter' in originalDoc) {
    data.deleteAfter = originalDoc.deleteAfter
  }
  return data
}

/**
 * Job applications sent through the careers form (owner, F23, 2026-10-07).
 *
 * The posture is `Inquiries.ts`' word for word, for the same reasons: **stored first, emailed
 * second**, so a mail outage costs a notification and never an application; `create` closed to
 * everyone (the route writes with the local API after its checks); `read` signed-in people only
 * — these rows hold a named person, their phone and their work history. Nothing here is ever
 * rendered on a public page.
 */
export const JobApplications: CollectionConfig = {
  slug: 'job-applications',
  labels: { singular: 'Job application', plural: 'Job applications' },
  access: {
    read: isSignedInPerson,
    create: () => false,
    update: isSignedInPerson,
    delete: isAdmin,
  },
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'role', 'phone', 'status', 'createdAt', 'deleteAfter'],
    description:
      'Applications sent through the form on the careers page. Each is saved here BEFORE the notification email is attempted. Keep each one for 12 months, then delete it: the "Delete after" column shows the date.',
    disableCopyToLocale: true,
  },
  hooks: {
    beforeChange: [setDeleteAfter],
    beforeDelete: [rememberApplicationFilesToDelete],
    afterDelete: [deleteRememberedApplicationFiles],
  },
  fields: [
    { name: 'name', type: 'text', required: true, admin: { readOnly: true } },
    {
      name: 'phone',
      type: 'text',
      required: true,
      admin: { readOnly: true, description: 'Stored as typed, with the country code first.' },
    },
    { name: 'email', type: 'email', admin: { readOnly: true } },
    {
      name: 'role',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
        description: 'What they do: one of the form’s roles, or their own words.',
      },
    },
    { name: 'years', type: 'number', min: 0, max: 60, admin: { readOnly: true } },
    { name: 'note', type: 'textarea', admin: { readOnly: true } },
    {
      name: 'files',
      type: 'join',
      collection: 'application-files',
      on: 'application',
      admin: { description: 'The CV, if one was sent. It downloads when opened.' },
    },
    {
      name: 'filesError',
      type: 'text',
      admin: {
        readOnly: true,
        description:
          'Why a CV could not be saved, if one could not. The application itself was saved.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Reviewed', value: 'reviewed' },
        { label: 'Contacted', value: 'contacted' },
      ],
      admin: { description: 'The one field on this screen you are meant to change.' },
    },
    {
      name: 'deleteAfter',
      type: 'date',
      admin: {
        readOnly: true,
        description: '12 months after it arrived. Delete the application on or after this date.',
      },
    },
    {
      name: 'notified',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
        description: 'Whether the notification email was accepted for delivery.',
      },
    },
    {
      name: 'notifyError',
      type: 'text',
      admin: {
        readOnly: true,
        description:
          'Why the notification could not be sent, if it could not. The application is unaffected.',
      },
    },
  ],
}
