import { isValidProductCode, isValidSlug } from '@run-apparel/shared'
import { APIError, type CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor, isAuthenticated } from '../access/roles'
import { cameraFields } from '../fields/camera'
import { colourwaysField } from '../fields/colourways'
import { assertPublishable, deriveVariantsVerified, toGateColourways } from './publishGating'

export const DEFAULT_RETIRED_MESSAGE =
  'The colourway linked by this QR is no longer active. You are viewing the current available reference.'

/**
 * Products — one document holds the whole garment, colours included.
 *
 * Colours used to be a separate `colourways` collection joined by a
 * relationship, with the product's `defaultColourway` needing to agree with an
 * `isDefault` checkbox on the colourway. Managing a product's colours meant
 * leaving the product, and the two could drift apart. Colours are now an inline
 * array (../fields/colourways.ts); the row order decides the default, so there
 * is nothing left to keep in step and nothing that can be orphaned.
 */
export const Products: CollectionConfig = {
  slug: 'products',
  // Explicit even though `false` is the 3.x default: Payload v4 flips the
  // default to ON, which would silently add a `_products_v` table to D1 and
  // double the row-writes per save. Stating it pins today's behaviour through
  // that upgrade. Remove deliberately if versioning is ever wanted.
  versions: false,
  admin: {
    useAsTitle: 'productName',
    defaultColumns: ['productCode', 'productName', 'category', 'status'],
    group: 'Content',
    description:
      'One page per garment. Fill it top to bottom: the basics, then the colours, then upload your CLO file on the “3D file” tab.',
  },
  access: {
    // Anonymous visitors read only through the dedicated public viewer endpoint.
    read: isAuthenticated,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        const resolved = { ...originalDoc, ...data }
        const colourways = toGateColourways(resolved.colourways)

        // "Colours checked" is no longer a box the owner ticks and hopes about:
        // it is true exactly when every colour on show has been pointed at a
        // colour that is actually inside the processed file.
        data.variantsVerified = deriveVariantsVerified(colourways, resolved.fileColours)

        // All publish invariants live in a pure, unit-tested function. It needs
        // no database access any more — the colours arrived with the document.
        //
        // The rethrow is load-bearing, not ceremony. A plain Error thrown from a
        // hook is caught by Payload's generic handler and shown as the useless
        // "Something went wrong." — which is exactly what these carefully worded
        // messages turned into on the first run of this gate. APIError's message
        // is surfaced verbatim with the status given. (RawUploads learned the
        // same lesson; see its beforeChange.) assertPublishable stays free of any
        // Payload import so it remains testable without a database.
        try {
          assertPublishable(
            {
              id: originalDoc?.id,
              status: resolved.status,
              variantMode: resolved.variantMode,
              glbAsset: resolved.glbAsset,
              variantsVerified: data.variantsVerified,
            },
            colourways,
          )
        } catch (error) {
          throw new APIError(error instanceof Error ? error.message : String(error), 400)
        }
        return data
      },
    ],
  },
  fields: [
    // ── Sidebar: the two things changed most often, always visible ──────────
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      label: 'Status',
      options: [
        { label: 'Draft — only you can see it', value: 'draft' },
        { label: 'Published — live on the website', value: 'published' },
        { label: 'Archived — taken down', value: 'archived' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Nothing is public until this says Published.',
      },
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      label: 'Order in lists',
      admin: { position: 'sidebar', description: 'Lower numbers come first.' },
    },

    {
      type: 'tabs',
      tabs: [
        // ── 1. What it is ──────────────────────────────────────────────────
        {
          label: 'Product',
          description: 'The basics. Start here.',
          fields: [
            {
              name: 'productName',
              type: 'text',
              required: true,
              label: 'Product name',
              admin: {
                description:
                  'What buyers see at the top of the page, e.g. Velocity Performance Tee.',
              },
            },
            {
              name: 'productCode',
              type: 'text',
              required: true,
              unique: true,
              label: 'Product code',
              validate: (value: unknown) => {
                if (typeof value !== 'string' || value.trim() === '') {
                  return 'Every product needs a code, e.g. N001.'
                }
                return isValidProductCode(value.trim())
                  ? true
                  : `“${value}” can’t be used as a product code. Use capital letters and numbers, starting with a letter — e.g. N001.`
              },
              admin: { description: 'Your internal code. Capital letters and numbers, e.g. N001.' },
            },
            {
              name: 'slug',
              type: 'text',
              required: true,
              unique: true,
              index: true,
              label: 'Web address word',
              validate: (value: unknown) => {
                if (typeof value !== 'string' || value.trim() === '') {
                  return 'Every product needs a web address word, e.g. n001.'
                }
                return isValidSlug(value.trim())
                  ? true
                  : `“${value}” can’t be used in a web address. Use lowercase letters, numbers and hyphens only — e.g. n001.`
              },
              admin: {
                description:
                  'The word in this product’s link and QR codes: wear-run.help/n001/navy. Never change it once QR codes are printed.',
              },
            },
            {
              name: 'category',
              type: 'select',
              required: true,
              label: 'Type of product',
              options: [
                { label: 'Sportswear', value: 'Sportswear' },
                { label: 'Teamwear & Uniforms', value: 'Teamwear & Uniforms' },
                { label: 'Casual Wear', value: 'Casual Wear' },
                { label: 'Outerwear', value: 'Outerwear' },
                { label: 'Sports Accessories', value: 'Sports Accessories' },
              ],
              admin: { description: 'Pick the closest match. Used for grouping only.' },
            },
            {
              name: 'presentationMode',
              type: 'select',
              required: true,
              defaultValue: 'floatingGarment',
              label: 'How the garment is shown',
              options: [
                { label: 'Floating garment', value: 'floatingGarment' },
                { label: 'Invisible mannequin', value: 'invisibleMannequin' },
              ],
              admin: {
                description:
                  '“Floating garment” suits most items. “Invisible mannequin” holds the shape of structured pieces like jackets.',
              },
            },
          ],
        },

        // ── 2. Colours — the whole point of the redesign ────────────────────
        {
          label: 'Colours',
          description:
            'Everything about this garment’s colours lives here. You never have to go anywhere else to manage them.',
          fields: [colourwaysField],
        },

        // ── 3. The 3D file ─────────────────────────────────────────────────
        {
          label: '3D file',
          description:
            'Upload your CLO export here. Big files and messy names are fine — it is shrunk automatically.',
          fields: [
            {
              name: 'rawUploads',
              type: 'join',
              collection: 'raw-uploads',
              on: 'targetProduct',
              label: 'Your CLO files',
              admin: {
                allowCreate: true,
                defaultColumns: ['filename', 'status', 'detail', 'resultGlb'],
                description:
                  'Upload your raw CLO export here. Watch the Status column: Queued → Processing → Ready to review. Then pick the finished file below.',
              },
            },
            {
              name: 'variantMode',
              type: 'select',
              required: true,
              defaultValue: 'single-glb-variants',
              label: 'How the colours are stored',
              options: [
                { label: 'One file with all colours (normal)', value: 'single-glb-variants' },
                { label: 'A separate file for each colour', value: 'separate-glb-per-colour' },
              ],
              admin: {
                description:
                  '“One file with all colours” is normal. Only switch to a separate file per colour if the combined file looks wrong — publishing must never be blocked.',
              },
            },
            {
              name: 'glbAsset',
              type: 'upload',
              relationTo: 'media',
              label: 'Finished 3D file',
              admin: {
                condition: (data) => data?.variantMode === 'single-glb-variants',
                description:
                  'The shrunk file the robot produced. Pick it from “Your CLO files” above once its Status says Ready to review. Never a raw CLO export.',
              },
            },
            {
              name: 'posterFallback',
              type: 'upload',
              relationTo: 'media',
              label: 'Backup picture',
              admin: {
                description:
                  'Shown if the 3D model cannot load on someone’s phone. Optional but recommended.',
              },
            },
            {
              name: 'variantsVerified',
              type: 'checkbox',
              defaultValue: false,
              label: 'Colours checked',
              admin: {
                readOnly: true,
                description:
                  'Ticks itself once every colour on show has been matched to a colour inside your file. You do not set this.',
              },
            },
            {
              name: 'fileColours',
              type: 'json',
              label: 'Colours found inside your file',
              admin: {
                // Machine data: written by the shrink robot, read by the
                // "Which colour in your CLO file is this?" dropdown. Showing a
                // raw JSON editor here would be noise, not information.
                hidden: true,
                description: 'Set automatically when your CLO file is processed.',
              },
            },
          ],
        },

        // ── 4. Copy shown on the page ──────────────────────────────────────
        {
          label: 'Fabric & fit',
          fields: [
            {
              name: 'fabricComposition',
              type: 'text',
              label: 'What it’s made of',
              admin: { description: 'e.g. Recycled polyester / elastane.' },
            },
            {
              name: 'gsm',
              type: 'text',
              label: 'Fabric weight',
              admin: { description: 'e.g. 160 GSM.' },
            },
            {
              name: 'garmentFit',
              type: 'text',
              label: 'How it fits',
              admin: { description: 'e.g. Athletic regular.' },
            },
            {
              name: 'performanceFeatures',
              type: 'array',
              label: 'Special features',
              labels: { singular: 'Feature', plural: 'Features' },
              admin: { description: 'Short phrases, e.g. “Moisture management”. One per row.' },
              fields: [{ name: 'feature', type: 'text', required: true, label: 'Feature' }],
            },
          ],
        },
        {
          label: 'How we build your product',
          fields: [
            {
              name: 'customisationIntro',
              type: 'richText',
              label: 'Opening paragraph',
              admin: {
                description:
                  'The paragraph above the steps. Business-to-business wording only — this is not a shop.',
              },
            },
            {
              name: 'customisationSteps',
              type: 'array',
              label: 'The steps',
              labels: { singular: 'Step', plural: 'Steps' },
              admin: { description: 'Shown in order as the “How we build your product” list.' },
              fields: [
                { name: 'number', type: 'number', required: true, label: 'Step number' },
                { name: 'title', type: 'text', required: true, label: 'Step title' },
                { name: 'body', type: 'textarea', required: true, label: 'Step text' },
              ],
            },
          ],
        },

        // ── 5. Rarely touched ──────────────────────────────────────────────
        {
          label: 'Advanced',
          description: 'Sensible defaults are already set. You can usually ignore this tab.',
          fields: [
            ...cameraFields,
            {
              name: 'catalogueUrl',
              type: 'text',
              required: true,
              defaultValue: 'https://wear-run.help/catalogue',
              label: 'Catalogue link',
              validate: (value: unknown) => {
                if (typeof value !== 'string' || value.trim() === '') {
                  return 'A catalogue link is required.'
                }
                try {
                  new URL(value)
                  return true
                } catch {
                  return `“${value}” is not a complete web address. It needs to start with https:// — e.g. https://wear-run.help/catalogue.`
                }
              },
              admin: { description: 'Where the “Catalogue” button sends people.' },
            },
            {
              name: 'retiredMessage',
              type: 'text',
              required: true,
              defaultValue: DEFAULT_RETIRED_MESSAGE,
              label: 'Message for retired colours',
              admin: {
                description:
                  'Shown when someone scans a QR code for a colour that has been switched off.',
              },
            },
          ],
        },
      ],
    },
  ],
}
