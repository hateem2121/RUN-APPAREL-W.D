import {
  BlockquoteFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
  OrderedListFeature,
  ParagraphFeature,
  UnorderedListFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical'
import type { Access, CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../access/roles'
import { keptPagesAfterChange, keptPagesAfterDelete } from '../lib/contentVersion'
import { JOURNAL_CLUSTERS, JOURNAL_PATH, JOURNAL_RELATED_PAGES } from '../lib/journal'
import {
  checkedByRequired,
  lockPublishedSlug,
  markFirstPublished,
  pingIndexNowWhenPublished,
  relatedPagesRequired,
  requireShareImageSize,
  validSlug,
} from '../lib/journalHooks'

/**
 * ⚠️ DRAFTS ARE PRIVATE. Anyone signed in reads everything; everyone else reads published
 * documents only (Payload's own pattern, docs "Drafts", read 2026-10-07). The site's readers in
 * `lib/content.ts` ask for `_status: published` and `draft: false` THEMSELVES, because the local
 * API overrides access control by default (docs "Local API: access control", read 2026-10-07).
 * Shared by `CaseStudies.ts`.
 */
export const publishedOrSignedIn: Access = ({ req }) =>
  req.user ? true : { _status: { equals: 'published' } }

/**
 * The post body's editor: the parts a post needs and nothing that can break the page. Headings
 * are h2 and h3 only, because the page's one h1 is the title (E7). Links may point inside the
 * site at another post; `JournalPost.tsx` turns that into its address.
 */
export const journalBodyEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
    BoldFeature(),
    ItalicFeature(),
    UnorderedListFeature(),
    OrderedListFeature(),
    LinkFeature({ enabledCollections: ['journal-posts'] }),
    BlockquoteFeature(),
    UploadFeature({ collections: { media: { fields: [] } } }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
})

/**
 * Remembers the first publish (so a published address stays locked) — shared with
 * `CaseStudies.ts`. Read-only and in the sidebar: the owner never sets it.
 */
export const firstPublishedAtField = {
  name: 'firstPublishedAt',
  type: 'date',
  admin: {
    readOnly: true,
    position: 'sidebar',
    description: 'Set when this was first published. From then on its address cannot change.',
  },
} as const

/**
 * A Journal post (owner, 2026-10-06: the Journal is written in the CMS; every other new page is
 * code). PLAN.md E7, with three additions: `firstPublishedAt` (above), the "one guide and one
 * buyer page" rule on Read more (D7), and the editor's restricted features.
 */
export const JournalPosts: CollectionConfig = {
  slug: 'journal-posts',
  labels: { singular: 'Journal post', plural: 'Journal posts' },
  admin: {
    group: 'Website',
    useAsTitle: 'title',
    defaultColumns: ['title', 'cluster', '_status', 'publishedAt'],
    description:
      'Posts for the Journal on the website. Save a draft as often as you like: only a published post is shown, and once published its address cannot change.',
  },
  versions: { drafts: true, maxPerDoc: 25 },
  access: {
    read: publishedOrSignedIn,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [lockPublishedSlug, markFirstPublished, requireShareImageSize],
    afterChange: [keptPagesAfterChange, pingIndexNowWhenPublished(JOURNAL_PATH)],
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
          'The end of the post’s address: wear-run.com/journal/<this>. It cannot change once published.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
      maxLength: 160,
      admin: { description: 'One or two sentences. Shown in search results and link previews.' },
    },
    {
      name: 'cluster',
      type: 'select',
      required: true,
      options: JOURNAL_CLUSTERS.map((cluster) => ({ label: cluster.label, value: cluster.value })),
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      admin: { description: 'Leave empty to show RUN APPAREL as the writer.' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: { position: 'sidebar' },
    },
    firstPublishedAtField,
    { name: 'heroImage', type: 'upload', relationTo: 'media', required: true },
    {
      name: 'shareImage',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: { description: 'The picture shown when the post is shared. At least 1200 × 630.' },
    },
    { name: 'body', type: 'richText', required: true, editor: journalBodyEditor },
    {
      name: 'relatedPages',
      label: 'Read more',
      type: 'select',
      hasMany: true,
      required: true,
      options: JOURNAL_RELATED_PAGES.map((page) => ({ label: page.label, value: page.path })),
      validate: (value: unknown) => relatedPagesRequired(value),
      admin: { description: 'At least one buyer guide and one “What we make” page.' },
    },
    { name: 'aiAssisted', label: 'Drafted with AI help', type: 'checkbox', defaultValue: false },
    {
      name: 'checkedBy',
      type: 'text',
      validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) =>
        checkedByRequired(value, siblingData),
      admin: {
        condition: (data) => Boolean(data?.aiAssisted),
        description: 'The person who checked the post. Shown on the page.',
      },
    },
  ],
}
