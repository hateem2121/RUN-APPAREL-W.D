import { isValidSlug } from '@run-apparel/shared'
import type { ArrayField } from 'payload'
import { IMAGE_MIME_TYPES, MODEL_MIME_TYPES } from '../collections/mediaRules'
import { deriveSlug } from './deriveSlug'

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
  // ⚠️ DELIBERATELY NO `minRows: 1`. It was here until 2026-08-09 and it fired at
  // the one moment the answer cannot be known: a brand-new product could not be
  // SAVED until the owner had typed a colour name and a `slug` — the same slug
  // this file's own help text calls "never change it once QR codes are printed".
  // But the CLO file has not been uploaded yet at that point (the "3D file" tab's
  // join field does not even render an upload button until the document has an
  // id), so the owner invents a colour, the file is processed, and
  // ImportColoursFromFile then offers the REAL colours out of the file — leaving
  // a guessed row to delete. The whole design says the file tells you the
  // colours; that rule said tell me first.
  //
  // Nothing is unguarded by removing it. `assertPublishable` already refuses a
  // published product with no colours, and says so better: "This product has no
  // colours yet. Add at least one on the Colours tab before publishing."
  // (../collections/publishGating.ts). Same reason `posterPreview` and
  // `variantId` are not `required` — the gate insists at publish time, so a
  // half-finished draft can still be saved.
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
      // Deliberately NOT required — same reasoning as posterPreview and variantId
      // below, extended here on 2026-08-11. A swatch-only row from a low-confidence
      // colour import (buildImportedRow in packages/shared/src/importColours.ts)
      // arrives with an empty name ON PURPOSE, for a human to fill in later — see
      // the note text in apps/shrink/src/colourImport.ts ("name any that need
      // one"). `required: true` here made that state impossible to SAVE, which
      // blocked not just the owner's own "Add the ticked colours" button but the
      // shrink robot's automated write: Payload rejects the whole `colourways`
      // array if any one row fails validation, so the entire import silently
      // failed the moment a single colour matched with low confidence — the exact
      // input `planColourImport`'s own tests require it to handle. Verified against
      // a real local Payload+D1 instance: PATCHing a row with `displayName: ''`
      // threw `ValidationError` ("This field is required.") before this change.
      // The publish gate is the enforcement point instead — see
      // collectPublishProblems's `noName` check in publishGating.ts — exactly like
      // the two fields below.
      label: 'Colour name',
      admin: { description: 'What buyers see on the colour button, e.g. Navy.' },
    },
    {
      name: 'slug',
      type: 'text',
      label: 'Web address word',
      validate: (value: unknown, { data }: { data?: unknown }) => {
        // Blank is allowed here for the same reason displayName above is not
        // `required` — a swatch-only imported row must be SAVEABLE with no slug
        // yet. This used to be an unconditional required-style error regardless of
        // the `required` flag (a custom `validate` replaces Payload's default
        // check entirely, so removing `required: true` alone would not have been
        // enough). The publish gate's `noSlug` check in publishGating.ts is what
        // stops a blank slug reaching a live, switched-on colour.
        if (typeof value !== 'string' || value.trim() === '') return true
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
      hooks: {
        beforeValidate: [
          ({ siblingData, value }) => {
            // Blank only — never a correction. Same rule as the product slug: this
            // one is on a printed QR tag too. Note there is deliberately NO
            // `operation` guard here: array rows carry no per-row operation, so
            // emptiness IS the guard — and it is the stronger of the two anyway.
            if (typeof value === 'string' && value.trim() !== '') return value
            return deriveSlug(siblingData?.displayName) || value
          },
        ],
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
      // Pictures only — see the note on Products.glbAsset. Enforced server-side
      // too, and checked against the live data before shipping: every stored
      // poster is `image/webp`, so no published colour fails the new rule.
      filterOptions: { mimeType: { in: [...IMAGE_MIME_TYPES] } },
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
      hooks: {
        beforeValidate: [
          ({ data, siblingData, value }) => {
            // The publish gate refuses any colour on show without a photo
            // description, and at 100+ garments with up to 10 colours each that is up
            // to 1,000 near-identical sentences typed by hand. The template is what a
            // person writes anyway. Blank only, and fully editable afterwards.
            if (typeof value === 'string' && value.trim() !== '') return value
            const product = typeof data?.productName === 'string' ? data.productName.trim() : ''
            const colour =
              typeof siblingData?.displayName === 'string' ? siblingData.displayName.trim() : ''
            if (product === '' || colour === '') return value
            return `${product} in ${colour}`
          },
        ],
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
      filterOptions: { mimeType: { in: [...MODEL_MIME_TYPES] } },
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
