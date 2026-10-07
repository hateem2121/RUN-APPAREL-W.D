import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../access/roles'
import { keptPagesAfterChange, keptPagesAfterDelete } from '../lib/contentVersion'
import { consentRecorded, linkedinUrl } from '../lib/journalHooks'

/**
 * The people who write Journal posts (PLAN.md E7, T14; G19).
 *
 * ⚠️ A PERSON IS SHOWN ONLY WITH THEIR WRITTEN CONSENT. The owner records it on a signed form
 * (OWNER-FACTS F24, 2026-10-07); `consentRecorded` must be ticked before an author can be saved,
 * and until the owner names someone who agreed, a post has no author and the company is named
 * instead. No invented authors.
 *
 * `read` is public on purpose: an author's name, role, one-line bio, photo and LinkedIn page are
 * exactly what a post shows. Nothing private is stored here.
 */
export const Authors: CollectionConfig = {
  slug: 'authors',
  labels: { singular: 'Author', plural: 'Authors' },
  admin: {
    group: 'Website',
    useAsTitle: 'name',
    defaultColumns: ['name', 'role', 'updatedAt'],
    description:
      'People named as the writer of a Journal post. Add someone only after they have signed the consent form. A post with no author is shown as written by RUN APPAREL.',
  },
  access: {
    read: () => true,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [keptPagesAfterChange],
    afterDelete: [keptPagesAfterDelete],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'role', type: 'text', admin: { description: 'For example, "Merchandiser".' } },
    { name: 'bio', type: 'textarea', maxLength: 300, admin: { description: 'One line.' } },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    {
      name: 'linkedinUrl',
      label: 'LinkedIn page',
      type: 'text',
      validate: (value: unknown) => linkedinUrl(value),
    },
    {
      name: 'consentRecorded',
      label: "I have this person's written consent to show their name, role and photo",
      type: 'checkbox',
      defaultValue: false,
      validate: (value: unknown) => consentRecorded(value),
    },
  ],
}
