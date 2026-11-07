import type { CollectionConfig, Field } from 'payload'
import { isAdmin, isSignedInPerson } from '../access/roles'
import { addCalendarYears, KEEP_YEARS } from '../../templateDownloadRetention.mjs'

/**
 * ⚠️ A RECORD, NOT A FORM: NO SAVE MAY CHANGE IT (security review of afba25d2, 6 Nov 2026).
 * `admin.readOnly` only hides the control on the admin screen; a signed-in person's REST PATCH could
 * still rewrite what someone typed, or turn an unticked updates box into a recorded yes. Field-level
 * `update: () => false` makes Payload drop such a change on every path. The download route still
 * writes the outcome (`notified`), because its local API calls run with `overrideAccess: true`.
 */
const recorded = <F extends Field>(field: F): F => ({ ...field, access: { update: () => false } })

/**
 * The two fields a person on the team may change. Everything else is a record (`recorded`).
 * `updatesStoppedAt` is NOT behind the lock on purpose: `updates` and `updatesAt` stay the untouched
 * record of the yes, and the stop is a second, separate fact beside it.
 */
const EDITABLE = new Set(['deleteAfter', 'updatesStoppedAt'])

type DeleteAfterArgs = {
  data: Record<string, unknown>
  operation: string
  /** For tests only; Payload never passes it. */
  now?: Date
}

/**
 * ⚠️ SET AT RECEIPT, AND MOVED BY A PERSON, NOT BY A SAVE. The 2 years count from the LAST CONTACT
 * (owner, 6 Nov 2026), so unlike a job application's date this one may be moved on: when the team
 * writes to the person again, they set it 2 years on. A save that does not touch it keeps it.
 */
export const setDeleteAfter = ({ data, operation, now }: DeleteAfterArgs) => {
  if (operation === 'create') {
    const at = now ?? new Date()
    // Exact calendar years (owner, 7 Nov 2026): the same date 2 years on, and 29 Feb gives 1 Mar. The
    // SAME function the daily clean-up uses for its fallback, so the two cannot drift apart.
    data.deleteAfter = addCalendarYears(at, KEEP_YEARS).toISOString()
  }
  return data
}

/**
 * Who downloaded the free tech-pack template (C1, owner approved 6 Nov 2026: "each email is saved in
 * the CMS and also emailed to the owner").
 *
 * The posture is `Inquiries.ts`' word for word, for the same reasons: **stored first, emailed
 * second**, so a mail outage costs a notification and never the record; `create` closed to everyone
 * (the download route writes with the local API after its checks); `read` signed-in PEOPLE only, not
 * the robot's API key — these rows hold a named person, their employer and their email. Nothing here
 * is ever rendered on a public page.
 *
 * ⚠️ THE UPDATES BOX IS A RECORD OF CONSENT, NOT A SETTING (owner, 6 Nov 2026: "record each yes").
 * `updates` and `updatesAt` are what the person ticked and when, so both are read-only. The privacy
 * page promises: no email, message or call unless they ticked it or wrote first; an unsubscribe link
 * in every update; and, once they stop, only their email kept so no update reaches them again.
 */
export const TemplateDownloads: CollectionConfig = {
  slug: 'template-downloads',
  labels: { singular: 'Template download', plural: 'Template downloads' },
  access: {
    read: isSignedInPerson,
    create: () => false,
    update: isSignedInPerson,
    delete: isAdmin,
  },
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'company', 'email', 'country', 'updates', 'createdAt', 'deleteAfter'],
    description:
      'Who downloaded the free tech pack template. Each is saved here BEFORE the notification email is attempted. Keep the details for 2 years from your last contact with the person: the "Delete after" date shows when, and you move it on when you write to each other again. Never email, message or call someone who did not tick "Send me occasional updates" unless they write to us first.',
    disableCopyToLocale: true,
  },
  hooks: {
    beforeChange: [setDeleteAfter],
  },
  // Every field is a record (`recorded`, above) except the date to delete by and the date updates
  // stopped, which a person sets.
  fields: (
    [
      {
        name: 'template',
        type: 'select',
        required: true,
        defaultValue: 'tech-pack',
        options: [{ label: 'Tech pack template', value: 'tech-pack' }],
        admin: { readOnly: true, description: 'Which template they downloaded.' },
      },
      { name: 'name', type: 'text', required: true, admin: { readOnly: true } },
      {
        name: 'email',
        type: 'email',
        required: true,
        admin: { readOnly: true, description: 'Their company email, as typed.' },
      },
      { name: 'company', type: 'text', required: true, admin: { readOnly: true } },
      { name: 'country', type: 'text', required: true, admin: { readOnly: true } },
      { name: 'jobTitle', type: 'text', admin: { readOnly: true } },
      {
        name: 'whatsapp',
        type: 'text',
        admin: { readOnly: true, description: 'Stored as typed, with the country code first.' },
      },
      {
        name: 'updates',
        type: 'checkbox',
        defaultValue: false,
        label: 'Asked for occasional updates',
        admin: {
          readOnly: true,
          description:
            'Whether they ticked "Send me occasional updates". Unticked means we send them nothing unless they write to us first.',
        },
      },
      {
        name: 'updatesAt',
        type: 'date',
        admin: {
          readOnly: true,
          date: { pickerAppearance: 'dayAndTime' },
          description: 'When they ticked it: the record of their yes.',
        },
      },
      {
        name: 'deleteAfter',
        type: 'date',
        admin: {
          description:
            '2 years after our last contact with them. Move it on when you write to each other again. Someone who asked for updates keeps their email and their yes until they stop the updates; after that, keep only their email so no update reaches them again.',
        },
      },
      {
        name: 'updatesStoppedAt',
        type: 'date',
        label: 'Updates stopped on',
        admin: {
          date: { pickerAppearance: 'dayOnly' },
          description:
            "When someone asks to stop the updates, set today's date here. The daily clean-up then keeps only their email address, so that no update reaches them again, and never deletes it.",
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
            'Why the notification could not be sent, if it could not. The download itself is unaffected.',
        },
      },
    ] as Field[]
  ).map((field) => ('name' in field && EDITABLE.has(field.name) ? field : recorded(field))),
}
