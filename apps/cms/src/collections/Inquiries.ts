import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated } from '../access/roles'

/**
 * Inquiries sent through the contact form.
 *
 * Owner decision 2026-09-07 (D3, FA-I-06): **stored first, emailed second**. A mail
 * outage then costs a notification and never the inquiry. The audit's case against a form
 * at all was that one which silently drops a buyer's message is worse than a mailto link
 * that works — this ordering is the answer to it, not a footnote.
 *
 * ⚠️ `create` IS CLOSED TO EVERYONE, INCLUDING THE FORM. That is not an oversight and it
 * is the whole security posture of this collection. The public route handler writes with
 * the local API and `overrideAccess: true`, so the ONLY path in is code that has already
 * validated the input, checked the honeypot and passed the rate limiter. Opening `create`
 * to anonymous requests would put `POST /api/inquiries` on the internet with none of
 * that, and Payload's REST API would happily accept whatever shape it was given.
 *
 * ⚠️ AND `read` IS AUTHENTICATED, WHICH MATTERS MORE HERE THAN ON ANY OTHER COLLECTION.
 * These rows hold a named person, their employer, their address and their commercial
 * intentions — the most sensitive data this system stores, by a distance. `Media.read`
 * was narrowed on 2026-09-05 after it was found enumerating every model URL to anyone;
 * this starts closed rather than being narrowed later.
 *
 * ⚠️ NOTHING HERE IS EVER RENDERED ON A PUBLIC PAGE, and it must stay that way. There is
 * no projection function for this collection and no public endpoint reads it. A "recent
 * inquiries" feature would publish a customer's name and plans to the internet.
 */
export const Inquiries: CollectionConfig = {
  slug: 'inquiries',
  labels: { singular: 'Inquiry', plural: 'Inquiries' },
  access: {
    read: isAuthenticated,
    // See the warning above — the form writes through the local API, not through this.
    create: () => false,
    update: isAuthenticated,
    delete: isAdmin,
  },
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'company', 'email', 'status', 'createdAt'],
    description:
      'Messages sent through the form on the contact page. Every one is saved here BEFORE the notification email is attempted, so a mail problem can never lose an inquiry — if the email did not arrive, the message is still on this screen.',
    // Payload's own `createdAt` is the received time; a second field would drift from it.
    disableCopyToLocale: true,
  },
  fields: [
    { name: 'name', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'company', type: 'text', admin: { readOnly: true } },
    { name: 'email', type: 'email', required: true, admin: { readOnly: true } },
    { name: 'message', type: 'textarea', required: true, admin: { readOnly: true } },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Replied', value: 'replied' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: { description: 'The one field on this screen you are meant to change.' },
    },
    /*
     * ⚠️ THE NOTIFICATION'S OUTCOME IS RECORDED ON THE ROW, and this is the field that
     * makes "stored first" worth anything. Without it a failed email is invisible: the
     * inquiry is safely in the database and nobody knows to look. `notified: false` with a
     * reason beside it is what turns a silent loss into a visible one.
     */
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
          'Why the notification could not be sent, if it could not. The inquiry itself is unaffected — it is the message above.',
      },
    },
  ],
}
