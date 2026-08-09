import { isValidSlug } from '@run-apparel/shared'
import type { ArrayField } from 'payload'

/**
 * Colours, inline on the Product.
 *
 * This replaced a separate top-level `colourways` collection. That arrangement
 * encoded one fact — "which colour do visitors see first?" — in three places
 * (a `defaultColourway` relationship on the product, an `isDefault` checkbox on
 * the colourway, and an afterChange hook keeping the siblings in step), and
 * managing a product's colours meant navigating away from the product. Here the
 * order of the rows *is* the answer, so the three cannot disagree and a colour
 * can never be orphaned from its product.
 *
 * Three values the viewer API still exposes are no longer typed by anyone:
 *   - `sequence`   → the row's position in this array
 *   - `isDefault`  → the topmost row that is switched on
 *   - `variantId`  → picked from the names found inside the uploaded CLO file
 * See ../endpoints/projectViewer.ts, which derives all three.
 */

/** Rows of the colours array as the validators see them mid-edit. */
interface ColourRow {
  displayName?: unknown
  slug?: unknown
  variantId?: unknown
}

const rowsOf = (data: unknown): ColourRow[] => {
  const rows = (data as { colourways?: unknown } | null | undefined)?.colourways
  return Array.isArray(rows) ? (rows as ColourRow[]) : []
}

/** How many rows already use this value for `key` (trimmed, case-insensitive). */
const countUsing = (data: unknown, key: keyof ColourRow, value: string): number =>
  rowsOf(data).filter(
    (row) =>
      String(row[key] ?? '')
        .trim()
        .toLowerCase() === value.toLowerCase(),
  ).length

export const colourwaysField: ArrayField = {
  name: 'colourways',
  type: 'array',
  label: 'Colours',
  labels: { singular: 'Colour', plural: 'Colours' },
  minRows: 1,
  // Shared TypeScript interface name, so the generated type is `ProductColourway`
  // rather than an inline shape. Also keeps Payload v4 — which auto-generates a
  // top-level interface per block — from being a reason to reach for `blocks`.
  interfaceName: 'ProductColourway',
  admin: {
    components: {
      // Paths are relative to `admin.importMap.baseDir` (src) — see payload.config.ts.
      RowLabel: '/fields/ColourRowLabel#ColourRowLabel',
    },
    initCollapsed: true,
    description:
      'Every colour this garment comes in. Drag to reorder — the top colour that is switched on is the one people see when they open the page.',
  },
  fields: [
    {
      name: 'displayName',
      type: 'text',
      required: true,
      label: 'Colour name',
      admin: { description: 'What buyers see on the colour button, e.g. Navy.' },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      label: 'Web address word',
      validate: (value: unknown, { data }: { data?: unknown }) => {
        if (typeof value !== 'string' || value.trim() === '') {
          return 'Every colour needs a web address word, e.g. navy.'
        }
        const slug = value.trim()
        if (!isValidSlug(slug)) {
          return `“${slug}” can’t be used in a web address. Use lowercase letters, numbers and hyphens only — e.g. ${
            slug
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '') || 'navy'
          }.`
        }
        if (countUsing(data, 'slug', slug) > 1) {
          return `Two colours both use the web address word “${slug}”. Change one of them — for example “${slug}-marl”.`
        }
        return true
      },
      admin: {
        description:
          'The word in this colour’s link and QR code: wear-run.help/n001/navy. Lowercase, no spaces. Never change it once QR codes are printed — switch the colour off instead.',
      },
    },
    {
      name: 'variantId',
      type: 'text',
      label: 'Which colour in your CLO file is this?',
      validate: (value: unknown, { data }: { data?: unknown }) => {
        // Deliberately not `required`: when the product is first created the CLO
        // file has not been uploaded, so there is nothing to choose yet. The
        // publish gate is what insists on it — see ../collections/publishGating.
        if (typeof value !== 'string' || value.trim() === '') return true
        const name = value.trim()
        if (countUsing(data, 'variantId', name) > 1) {
          return `Two colours both point at “${name}” in your CLO file. Each colour needs its own.`
        }
        return true
      },
      admin: {
        components: {
          Field: '/fields/SourceVariantSelect#SourceVariantSelect',
        },
        description:
          'Upload your CLO file on the “3D file” tab first. Once it has been read, this list fills with the colours found inside it — pick the one that matches.',
      },
    },
    {
      name: 'posterPreview',
      // Deliberately not `required`: that fires on every save, so a half-filled
      // draft could not be saved at all. The publish gate insists on it instead,
      // naming the colour that is missing one.
      type: 'upload',
      relationTo: 'media',
      label: 'Photo of this colour',
      admin: {
        description:
          'A picture of the garment in this colour. It appears instantly while the spinning 3D model loads.',
      },
    },
    {
      name: 'altText',
      type: 'text',
      label: 'Photo description',
      admin: {
        description:
          'Describe the photo in a sentence, for people who use a screen reader. e.g. “Velocity Performance Tee in Navy”.',
      },
    },
    {
      name: 'hexSwatch',
      type: 'text',
      label: 'Colour chip (optional)',
      validate: (value: unknown) => {
        if (value == null || value === '') return true
        if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return true
        return `“${String(value)}” is not a colour code. It should be a hash followed by six letters or numbers, e.g. #22314E.`
      },
      admin: {
        description:
          'A colour code like #22314E, only so you can recognise the row at a glance. Buyers never see it.',
      },
    },
    {
      name: 'glbAsset',
      type: 'upload',
      relationTo: 'media',
      label: '3D file for this colour only',
      admin: {
        // Only meaningful in separate-file mode; hidden otherwise so the normal
        // path shows one fewer thing to wonder about. `siblingData` here is the
        // array row, so the product-level setting is read from `data`.
        condition: (data) => data?.variantMode === 'separate-glb-per-colour',
        description:
          'Only needed because this product is set to “A separate file for each colour”. Leave empty otherwise.',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Show this colour on the website',
      admin: {
        description:
          'Untick to retire a colour. Old QR codes still work — they show your first colour instead, with the retired message.',
      },
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Private note',
      admin: { description: 'Notes to yourself. Never shown to customers.' },
    },
  ],
}
