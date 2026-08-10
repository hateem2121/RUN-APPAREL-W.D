import { isValidProductCode, isValidSlug } from '@run-apparel/shared'
import { APIError, type CollectionConfig, type PayloadRequest } from 'payload'
import { isAdmin, isAdminOrEditor, isAuthenticated } from '../access/roles'
import { cameraFields } from '../fields/camera'
import { colourwaysField } from '../fields/colourways'
import { IMAGE_MIME_TYPES, MODEL_MIME_TYPES } from './mediaRules'
import {
  becameUnverifiedWhilePublished,
  GATED_FIELDS,
  assertPublishable,
  changesAnything,
  deriveVariantsVerified,
  toGateColourways,
} from './publishGating'

export const DEFAULT_RETIRED_MESSAGE =
  'The colourway linked by this QR is no longer active. You are viewing the current available reference.'

/**
 * Read the artwork verdict off the attached model.
 *
 * FAILS OPEN. If the media row cannot be read the publish proceeds, because the
 * alternative is that a transient D1 hiccup makes the whole catalogue
 * unpublishable with an error about artwork — which would be both wrong and
 * baffling. The verdict blocks a KNOWN-damaged file; it is not an availability
 * dependency for publishing at all.
 */
async function readArtworkVerdict(
  req: PayloadRequest,
  glbAsset: unknown,
): Promise<{ artworkVerdict?: string | null; artworkOverrideReason?: unknown }> {
  const id =
    glbAsset && typeof glbAsset === 'object'
      ? (glbAsset as { id?: unknown }).id
      : (glbAsset as string | number | null | undefined)
  if (id == null || id === '') return {}
  try {
    const media = (await req.payload.findByID({
      collection: 'media',
      id: id as string | number,
      depth: 0,
      req,
    })) as { artworkVerdict?: string | null; artworkOverrideReason?: unknown } | null
    if (!media) return {}
    return {
      artworkVerdict: media.artworkVerdict ?? null,
      artworkOverrideReason: media.artworkOverrideReason,
    }
  } catch {
    return {}
  }
}

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
      async ({ data, originalDoc, req }) => {
        const resolved = { ...originalDoc, ...data }
        const colourways = toGateColourways(resolved.colourways)

        // "Colours checked" is no longer a box the owner ticks and hopes about:
        // it is true exactly when every colour on show has been pointed at a
        // colour that is actually inside the processed file.
        data.variantsVerified = deriveVariantsVerified(colourways, resolved.fileColours)

        // A re-upload whose CLO colourways are named differently silently breaks
        // a LIVE product: the stored variantIds stop matching the file and the
        // colour buttons select nothing. The gate below deliberately does not run
        // on that write (see the note under it), so without this the page just
        // quietly stops working and the first report is a buyer's.
        //
        // Recorded, not refused. Best-effort: losing the note must never cost the
        // robot its colour-list write, which is the thing that repairs the state.
        if (
          becameUnverifiedWhilePublished(
            resolved.status,
            originalDoc?.variantsVerified,
            data.variantsVerified,
          )
        ) {
          try {
            await req.payload.create({
              collection: 'events',
              data: {
                type: 'diagnostic',
                event: 'variants-unverified-while-published',
                product: String(resolved.productCode ?? ''),
                message:
                  'A newly processed file uses different colour names, so this live product’s colour buttons no longer match it. Open the Colours tab and re-answer “Which colour in your CLO file is this?” for each colour.',
              },
              // Events are endpoint-only by access control (`create: () => false`),
              // so a system write has to say so explicitly — same as endpoints/events.ts.
              overrideAccess: true,
              req,
            })
          } catch {
            // Deliberately silent: see above.
          }
        }

        // Only re-run the publish checks when the write could actually change the
        // answer. A save that touches none of these cannot make a product more or
        // less publishable, so gating it achieves nothing and costs plenty:
        //
        //   - the shrink robot's `fileColours` write is exactly such a save, and
        //     on 2026-07-29 the gate rejected it, because N001 was already
        //     published without a model. The gate blocked the one write that
        //     populates "Which colour in your CLO file is this?" — i.e. it
        //     prevented recovery from the very state it was complaining about.
        //   - the same trap applied to a human: with N001 published and model-less,
        //     editing its fabric text or a camera angle threw the publish error too.
        //
        // A product already live in a bad state is a pre-existing condition. It is
        // fixed by attaching a model or moving to Draft, never by refusing edits.
        // NOTE the comparison is by VALUE, not by key presence. Payload merges the
        // whole existing document into `data` before this hook runs — a one-field
        // PATCH arrives with all 27 keys — so "did the caller send this field?" is
        // not answerable here and any key-presence check is always true.
        if (!changesAnything(GATED_FIELDS, data, originalDoc)) return data

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
        // The artwork verdict lives on the Media document, and `glbAsset` here is
        // usually a bare id — Payload does not populate uploads for beforeChange.
        // Read it in the hook and hand the value to the gate, so assertPublishable
        // stays pure and database-free and can keep being unit-tested without one.
        // Only on a publish, so ordinary saves cost no extra query.
        const artwork =
          resolved.status === 'published' ? await readArtworkVerdict(req, resolved.glbAsset) : {}

        try {
          assertPublishable(
            {
              id: originalDoc?.id,
              status: resolved.status,
              variantMode: resolved.variantMode,
              glbAsset: resolved.glbAsset,
              variantsVerified: data.variantsVerified,
              ...artwork,
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
            // `presentationMode` was here until 2026-08-09. It offered a choice
            // between "floating garment" and "invisible mannequin" that NOTHING
            // ever acted on: it was stored, projected through the public API, and
            // read by no line of apps/viewer/src. A setting that looks like it
            // does something and does not is worse than no setting — the owner
            // would reasonably have expected the page to change.
            //
            // ⚠️ THE COLUMN IS STILL THERE, ON PURPOSE. `presentation_mode text
            // DEFAULT 'floatingGarment' NOT NULL` stays in D1 and in every
            // migration that created it. Dropping it would mean a table rebuild,
            // and on D1 that is the single most hazardous operation in this repo:
            // `PRAGMA foreign_keys=OFF` is a no-op there, `defer_foreign_keys`
            // defers checks but not CASCADES, and a DROP runs an implicit DELETE
            // that cascades. An unused column with a default costs nothing and
            // breaks no insert. See CLAUDE.md and docs/RUNBOOK.md.
          ],
        },

        // ── 2. Colours — the whole point of the redesign ────────────────────
        {
          label: 'Colours',
          description:
            'Everything about this garment’s colours lives here. You never have to go anywhere else to manage them.',
          fields: [
            // Sits ABOVE the list, because its whole job is to tell you about
            // colours you cannot see. N001 had five colourways in its file and
            // three rows here; the other two were invisible to every buyer and
            // nothing in this screen hinted they existed.
            {
              name: 'importColours',
              type: 'ui',
              admin: {
                components: {
                  Field: '/fields/ImportColoursFromFile#ImportColoursFromFile',
                },
              },
            },
            colourwaysField,
          ],
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
              // Models only. Unfiltered until 2026-08-09, which meant the picker
              // offered every poster too — and the publish gate only tests that
              // *something* is attached, so a JPEG here published a page with an
              // empty 3D stage and nothing anywhere objected. Payload enforces
              // filterOptions server-side as well as in the UI, so this is a gate
              // rather than a convenience. Verified against the live library
              // before shipping: every stored model is `model/gltf-binary`, so no
              // existing product fails the new check.
              filterOptions: { mimeType: { in: [...MODEL_MIME_TYPES] } },
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
              filterOptions: { mimeType: { in: [...IMAGE_MIME_TYPES] } },
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
            {
              name: 'fileColourDetails',
              type: 'json',
              label: 'What colour each one actually is',
              admin: {
                hidden: true,
                description: 'Set automatically when your CLO file is processed.',
              },
              // ADDITIVE, never a replacement for `fileColours`. The dropdown
              // falls back to the plain string list whenever this is absent, so
              // a product last processed by an older container keeps working
              // with no backfill.
              //
              // Each entry: { variantId, hex, name, slug, deltaE, confidence,
              // sampledMaterial }. The swatch it powers is the whole point — the
              // live site spent five weeks showing a maroon garment labelled
              // "Navy" because nothing ever put the colour next to the name.
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
