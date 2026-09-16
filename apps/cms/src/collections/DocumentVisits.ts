import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/roles'

/**
 * One row per day, document, visitor code and kind — written only by the documents
 * Worker (`infra/apex-404/visits.js`, Task 5) through raw SQL against this table, never
 * through this collection's own create/update API. Admins read and prune; the Worker
 * writes.
 */
export const DocumentVisits: CollectionConfig = {
  slug: 'document-visits',
  labels: { singular: 'Document visit', plural: 'Document visits' },
  versions: false,
  admin: {
    group: 'Content',
    useAsTitle: 'day',
    defaultColumns: [
      'day',
      'document',
      'kind',
      'city',
      'country',
      'device',
      'browser',
      'opens',
      'furthestPage',
      'downloads',
      'minutesActive',
      'lastAt',
    ],
    description:
      'One line per person, per document, per day (Pakistan time). Counts of people are approximate. WhatsApp visits usually show as Safari or Chrome. Email scanners such as Outlook Safe Links can look like a person. Lines older than 12 months are deleted automatically.',
    components: {
      beforeListTable: ['/collections/DocumentVisitsSummary#DocumentVisitsSummary'],
    },
  },
  defaultSort: '-lastAt',
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  indexes: [{ fields: ['day', 'document', 'visitor', 'kind'], unique: true }],
  fields: [
    {
      name: 'day',
      type: 'text',
      label: 'Day',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'document',
      type: 'select',
      label: 'Document',
      required: true,
      admin: { readOnly: true },
      options: [
        { label: 'Catalogue', value: 'catalogue' },
        { label: 'Company profile', value: 'profile' },
      ],
    },
    {
      name: 'kind',
      type: 'select',
      label: 'Kind',
      required: true,
      admin: { readOnly: true },
      options: [
        { label: 'Person', value: 'person' },
        { label: 'Private (asked not to be tracked)', value: 'private' },
        { label: 'Link preview', value: 'link-preview' },
        { label: 'Robot', value: 'robot' },
        { label: 'Old link', value: 'old-link' },
      ],
    },
    { name: 'visitor', type: 'text', label: 'Visitor code', admin: { readOnly: true } },
    { name: 'firstAt', type: 'date', label: 'First seen', admin: { readOnly: true } },
    { name: 'lastAt', type: 'date', label: 'Last seen', admin: { readOnly: true } },
    {
      name: 'minutesActive',
      type: 'number',
      label: 'Minutes active (about)',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'opens',
      type: 'number',
      label: 'Opens',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'furthestPage',
      type: 'number',
      label: 'Read up to page',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'pagesTotal',
      type: 'number',
      label: 'Pages in document',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'downloads',
      type: 'number',
      label: 'Downloads',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    { name: 'country', type: 'text', label: 'Country', admin: { readOnly: true } },
    { name: 'region', type: 'text', label: 'Region', admin: { readOnly: true } },
    { name: 'city', type: 'text', label: 'City', admin: { readOnly: true } },
    { name: 'timezone', type: 'text', label: 'Time zone', admin: { readOnly: true } },
    { name: 'network', type: 'text', label: 'Network', admin: { readOnly: true } },
    { name: 'device', type: 'text', label: 'Device', admin: { readOnly: true } },
    { name: 'system', type: 'text', label: 'System', admin: { readOnly: true } },
    { name: 'browser', type: 'text', label: 'Browser or app', admin: { readOnly: true } },
    { name: 'language', type: 'text', label: 'Language', admin: { readOnly: true } },
    { name: 'cameFrom', type: 'text', label: 'Came from', admin: { readOnly: true } },
  ],
}
