import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor, isSignedInPerson } from '../access/roles'
import { CASE_STUDIES_PATH } from '../lib/caseStudies'
import { keptPagesAfterChange, keptPagesAfterDelete } from '../lib/contentVersion'
import {
  clientPermissionRequired,
  lockPublishedSlug,
  markFirstPublished,
  pingIndexNowWhenPublished,
  requireShareImageSize,
  validSlug,
} from '../lib/journalHooks'
import { firstPublishedAtField, publishedOrSignedIn } from './JournalPosts'

/**
 * A case study (PLAN.md D9, E7, Phase 5): what was made, for whom, how many, how long, the
 * challenge, what we did and the result, with the client's name and words only with their
 * permission. Drafts, access and hooks as `JournalPosts`.
 *
 * `/case-studies` is indexable and listed from day one, even empty (owner, 2026-10-07: "Show them
 * right away", replacing T5's `noindex` until the first one is published).
 */
export const CaseStudies: CollectionConfig = {
  slug: 'case-studies',
  labels: { singular: 'Case study', plural: 'Case studies' },
  admin: {
    group: 'Website',
    useAsTitle: 'title',
    defaultColumns: ['title', '_status', 'updatedAt'],
    description:
      'Stories of real orders for the website. Name the client or quote them only with their permission. Only a published case study is shown.',
  },
  versions: { drafts: true, maxPerDoc: 25 },
  access: {
    read: publishedOrSignedIn,
    // Every draft lives in the version history; Payload sets no default here (any caller signed in).
    readVersions: isSignedInPerson,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [lockPublishedSlug, markFirstPublished, requireShareImageSize],
    afterChange: [keptPagesAfterChange, pingIndexNowWhenPublished(CASE_STUDIES_PATH)],
    afterDelete: [keptPagesAfterDelete],
  },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 70 },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: (value: unknown) => validSlug(value),
      admin: {
        description:
          'The end of the address: wear-run.com/case-studies/<this>. It cannot change once published.',
      },
    },
    { name: 'description', type: 'textarea', required: true, maxLength: 160 },
    firstPublishedAtField,
    {
      name: 'clientDescription',
      label: 'For whom',
      type: 'text',
      required: true,
      admin: { description: 'Without a name, for example "a cycling club in the UK".' },
    },
    { name: 'clientNamed', label: 'Show the client’s name', type: 'checkbox', defaultValue: false },
    {
      name: 'clientName',
      type: 'text',
      admin: { condition: (data) => Boolean(data?.clientNamed) },
    },
    { name: 'whatWasMade', label: 'What was made', type: 'text', required: true },
    { name: 'quantity', label: 'How many', type: 'text', required: true },
    { name: 'timeline', label: 'How long', type: 'text', required: true },
    { name: 'challenge', label: 'The challenge', type: 'textarea', required: true },
    { name: 'whatWeDid', label: 'What we did', type: 'textarea', required: true },
    { name: 'result', label: 'The result', type: 'textarea', required: true },
    { name: 'clientQuote', label: 'The client’s words', type: 'textarea' },
    { name: 'quoteAttribution', type: 'text' },
    {
      name: 'clientPermission',
      label: 'The client agreed to be named or quoted',
      type: 'checkbox',
      defaultValue: false,
      validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) =>
        clientPermissionRequired(value, siblingData),
    },
    { name: 'images', type: 'upload', relationTo: 'media', hasMany: true },
    {
      name: 'relatedProducts',
      label: 'Garments',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
    },
    {
      name: 'shareImage',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description: 'The picture shown when the case study is shared. At least 1200 × 630.',
      },
    },
  ],
}
