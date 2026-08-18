import { isValidProductCode, isValidSlug } from '@run-apparel/shared'
import { APIError, type CollectionConfig, type PayloadRequest } from 'payload'
import { isAdmin, isAdminOrEditor, isAuthenticated } from '../access/roles'
import { cameraFields } from '../fields/camera'
import { colourwaysField } from '../fields/colourways'
import { deriveSlug } from '../fields/deriveSlug'
import type { CatalogueDefault } from '../payload-types'
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
 * Read the shared "how we build your product" copy off the CatalogueDefaults
 * global (globals/CatalogueDefaults.ts), for the defaultValue functions below.
 *
 * FAILS OPEN, same reasoning as readArtworkVerdict immediately above: on
 * create, a D1 hiccup reading the global must not make the whole product
 * uncreatable over default paragraph text — that would be an error about
 * catalogue copy blocking someone who is just trying to start a new garment.
 *
 * Returns null on any error, AND on a global that has never been saved:
 * Payload's findOne operation returns `{}` rather than the field-level
 * defaults when no row exists yet for a global (verified against Payload
 * 3.86.0's globals/operations/findOne.js — see task-9-report.md), which is
 * exactly the state this global is in immediately after this migration
 * deploys and before anyone opens Settings → Catalogue defaults and saves it.
 * Both cases fall back the same way: each field below applies the literal
 * default this file used before this global existed.
 */
async function readCatalogueDefaults(req: PayloadRequest): Promise<CatalogueDefault | null> {
  try {
    return await req.payload.findGlobal({
      slug: 'catalogue-defaults',
      depth: 0,
      req,
    })
  } catch {
    return null
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
    /**
     * The real customer page, beside the form.
     *
     * Until 2026-08-11 the only way to see what you had built was to save, open
     * a second tab and reload. At 100+ garments that is the loop you spend the
     * most time in.
     *
     * ⚠️ A DRAFT WILL NOT PREVIEW, and that is correct rather than a gap. The
     * public viewer endpoint serves published products only
     * (endpoints/publicViewer.ts filters `status: published` before anything
     * else), so a draft's URL 404s. Do NOT "fix" that by exposing drafts
     * publicly — the whole point of Draft is that nothing is reachable. A real
     * draft preview needs a signed preview route, which is its own piece of work.
     *
     * Returning null hides the panel entirely, which is a clearer answer than an
     * iframe showing an error page.
     */
    livePreview: {
      url: ({ data }) => {
        const slug = typeof data?.slug === 'string' ? data.slug.trim() : ''
        if (slug === '' || data?.status !== 'published') return null
        // The topmost switched-on colour is the default colourway — the same
        // rule the viewer itself applies to a bare /<product> link, so the panel
        // opens on what a customer scanning the QR code would see.
        const rows = Array.isArray(data?.colourways) ? data.colourways : []
        const first = rows.find((row) => row?.active !== false) ?? rows[0]
        const colour = typeof first?.slug === 'string' ? first.slug.trim() : ''
        return colour === ''
          ? `https://viewer.wear-run.help/${slug}`
          : `https://viewer.wear-run.help/${slug}/${colour}`
      },
    },
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
        // M2: the product name is passed so a colourway description naming a
        // DIFFERENT garment is caught here, where publishing is decided, rather
        // than by a customer's screen reader.
        const colourways = toGateColourways(resolved.colourways, String(resolved.productName ?? ''))

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
      hooks: {
        // A copy must never arrive published: it has no model attached (see
        // glbAsset's beforeDuplicate below) and no verified colours, so a published
        // duplicate would be an instantly-broken live page.
        beforeDuplicate: [() => 'draft'],
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
            // "What is still stopping this from going live?" — calls the same
            // pure collectPublishProblems that assertPublishable (used by the
            // beforeChange hook above) is built on, so this can never say
            // "ready" when the real gate would refuse the save. First field in
            // the tab: the owner should see it before touching anything else.
            // See ReadinessPanel.tsx for the one thing it deliberately cannot
            // check (the artwork verdict).
            {
              name: 'readiness',
              type: 'ui',
              admin: {
                components: { Field: '/fields/ReadinessPanel#ReadinessPanel' },
              },
            },
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
              name: 'shortDescription',
              type: 'textarea',
              /**
               * ⚠️ `maxLength: 400` was here until 2026-08-17. Removed by owner
               * decision while importing the 67-product printed catalogue, whose
               * own paragraphs run past 700 characters — the limit would have
               * silently truncated the source copy for most of the range on the
               * way in, and the truncation would have looked like an editing
               * choice rather than a validation.
               *
               * NOTHING HAD TO CHANGE IN D1. Payload's `maxLength` is a
               * validation only; `short_description` is plain unbounded `text`.
               * So this needed no migration, and none of the table-rebuild
               * hazards that come with one on D1 (see CLAUDE.md — a DROP runs an
               * implicit DELETE and that cascades).
               *
               * Unbounded is safe on the page for a specific, measured reason:
               * `.product-info__statement` is `max-width: 60ch` with no clamp and
               * sits BELOW the stage band, so a long paragraph only lengthens the
               * page. It cannot disturb the stage-height budget that
               * apps/viewer/CLAUDE.md records getting wrong three times.
               * Pinned by a >400-character case in endpoints/projectViewer.test.ts,
               * so re-adding a limit fails a test rather than silently clipping
               * every description that is already live.
               */
              label: 'Short description',
              admin: {
                description:
                  'A few sentences about this garment, shown under its name on the public page. Plain text — no links or formatting. There is no length limit, though the page reads best at three or four sentences. Leave it blank and the page uses the standard development-reference wording instead.',
              },
              // Deliberately NOT required. Every product that existed before
              // 2026-08-17 has none, and making it required would make all of them
              // unsaveable — including the shrink robot's own writes, which go
              // through the same validation.
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
                  : `“${value}” can’t be used as a product code. Use letters, numbers and hyphens, starting with a letter — e.g. N001 or RX-PS.`
              },
              admin: {
                description:
                  'Your internal code. Letters, numbers and hyphens, e.g. N001 or RX-PS. Lowercase is fine — it is saved in capitals.',
              },
              hooks: {
                /**
                 * Accept what the owner types; store what the system needs.
                 *
                 * ⚠️ THIS IS A NORMALISATION OF INPUT, NOT A CORRECTION OF STORED DATA,
                 * and the distinction is the one the slug field below is built around.
                 * A colourway slug is printed on physical QR tags, so nothing automated
                 * may ever rewrite one. A product code is not on a tag and not in a URL
                 * — it appears in the enquiry email and on the page — so trimming and
                 * uppercasing what someone typed is a courtesy, not a hazard. That is
                 * why this runs on update as well as create, where the slug's own hook
                 * deliberately does not.
                 *
                 * It exists because `isValidProductCode` rejects lowercase (see its own
                 * comment: mixed case would let two codes collide on the unique index
                 * while looking different to a person). Without this hook that rejection
                 * reaches the owner as an error about capital letters, for something the
                 * machine can obviously do itself.
                 */
                beforeValidate: [
                  ({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
                ],
                // Unique, and Payload copies a field's value verbatim into a duplicate
                // unless told otherwise — so without this, saving a freshly duplicated
                // product hits the same `products_product_code_idx` UNIQUE index the
                // original row already occupies. Confirmed by reading Payload 3.86.0's
                // duplicateDocument/index.js: it runs beforeDuplicate hooks over the
                // source doc BEFORE handing it to create, so this suffix is already in
                // place by the time the unique check runs.
                //
                // ⚠️ THIS WAS `${value}COPY` UNTIL 2026-08-17, under a comment titled
                // "NO HYPHEN" explaining that `-COPY` failed this field's own validate.
                // That was true and is not any more: `isValidProductCode` accepts a
                // hyphen between groups since the same date, so `N001-COPY` validates.
                // The comment is replaced rather than left, because a stale reason
                // reads as a live constraint.
                beforeDuplicate: [
                  ({ value }) => (typeof value === 'string' ? `${value}-COPY` : value),
                ],
              },
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
                /**
                 * ⚠️ THIS ONE STAYS STRICT, deliberately, while `productCode` above
                 * relaxed on the same day.
                 *
                 * A product's web address word goes into the URL a QR code on a
                 * physical garment tag points at. It cannot hold a space, an accent or
                 * a symbol without being percent-encoded into something nobody can read
                 * back off a tag, and it can never be changed once tags are printed. So
                 * the rule is unchanged — what changed is that the error now does the
                 * work instead of only naming the rule.
                 */
                if (isValidSlug(value.trim())) return true
                const suggestion = deriveSlug(value)
                return (
                  `“${value}” can’t be used in a web address. Use lowercase letters, numbers ` +
                  `and hyphens only — e.g. n001.` +
                  (suggestion ? ` Did you mean “${suggestion}”?` : '')
                )
              },
              admin: {
                description:
                  'The word in this product’s link and QR codes: wear-run.help/n001/navy. Never change it once QR codes are printed.',
              },
              hooks: {
                beforeValidate: [
                  ({ operation, siblingData, value }) => {
                    // Create only, blank only. See deriveSlug: this slug is on a printed QR
                    // tag, so this may suggest and may never correct. The `operation` guard is
                    // belt and braces on top of the blank check — an update that somehow
                    // arrived with an empty slug must still not be filled in silently, because
                    // by then a tag may exist.
                    if (operation !== 'create') return value
                    if (typeof value === 'string' && value.trim() !== '') return value
                    return deriveSlug(siblingData?.productName) || value
                  },
                ],
                // Same reasoning as productCode's beforeDuplicate, same unique index
                // (`products_slug_idx`). This runs before beforeValidate ever sees the
                // duplicate (see duplicateDocument/index.js), so by the time the
                // beforeValidate hook above checks "is this blank?" the answer is
                // already "no" — the two compose without a double-suffix or a collision.
                beforeDuplicate: [
                  ({ value }) => (typeof value === 'string' ? `${value}-copy` : value),
                ],
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
              hooks: {
                // A duplicate must not inherit the original's model: this file, and the
                // fileColours/fileColourDetails below that were read out of it, describe
                // one specific CLO export. Carrying them into a copy would show the
                // wrong garment under a new product until someone noticed and cleared
                // it by hand — worse than an empty stage, which the readiness panel and
                // the publish gate both already say something about.
                beforeDuplicate: [() => null],
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
              hooks: {
                // Same reasoning as glbAsset's beforeDuplicate: this is a reading of
                // THAT file, not of the product, so it must not survive into a copy
                // that has not had a file uploaded yet.
                beforeDuplicate: [() => null],
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
              hooks: {
                // Same reasoning as fileColours immediately above — read out of the
                // original CLO file, so it must not follow a duplicate that has none.
                beforeDuplicate: [() => null],
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
        /**
         * ⚠️ THIS TAB IS GONE FROM THE ADMIN UI, and its two fields are HIDDEN
         * rather than deleted. 2026-08-17, owner decision.
         *
         * "How we build your product" is now ONE text for the whole catalogue,
         * living in the `build-process` global and read on every public request
         * (globals/BuildProcess.ts). Editing it changes every page immediately,
         * including products made months ago — which is what an editor
         * reasonably expects and what the old seed-at-create design could not do.
         *
         * WHY THE FIELDS STAY. Two reasons, and either alone would be enough:
         *
         *   1. Removing a field means dropping its D1 columns, and on D1 a table
         *      rebuild is the single most hazardous operation in this repo — a
         *      DROP runs an implicit DELETE and that cascades, while
         *      `PRAGMA foreign_keys=OFF` is a no-op there. Same precedent as
         *      `presentation_mode`, retired in place on 2026-08-09 and still sat
         *      in the schema harmlessly.
         *   2. `buildViewerResponse` still FALLS BACK to these columns while the
         *      new global has no saved row — the window between this deploying
         *      and someone first opening the screen. Delete the data and every
         *      live page loses its build steps for that window.
         *
         * `hidden: true` on a FIELD hides it from the form only; it is not the
         * `admin.hidden` on a COLLECTION that also gates the admin ROUTES (see
         * RawUploads.ts for that trap). The REST API still exposes these, which
         * is what the fallback above needs.
         *
         * The `defaultValue` functions that seeded them from Catalogue defaults
         * are gone with the tab: seeding a hidden field nobody reads would write
         * a copy of the shared copy onto every new product, which is exactly the
         * drift this change removes.
         */
        {
          label: 'Superseded',
          description:
            'Nothing to do here. “How we build your product” now lives in one place for every product — find it in the sidebar under Content.',
          fields: [
            {
              name: 'customisationIntro',
              type: 'richText',
              label: 'Opening paragraph (no longer used)',
              admin: { hidden: true },
            },
            {
              name: 'customisationSteps',
              type: 'array',
              label: 'The steps (no longer used)',
              labels: { singular: 'Step', plural: 'Steps' },
              admin: { hidden: true },
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
              // Same inheritance as customisationIntro above. The `||` (not `??`)
              // is deliberate: an empty string read back from the global must also
              // fall through, not just null/undefined, since this field requires
              // non-empty text and readCatalogueDefaults cannot itself tell "global
              // unreadable" apart from "global exists but nobody has filled it in
              // yet" — see readCatalogueDefaults's comment for why both land here.
              // The literal is the same one this field always defaulted to, and
              // the one SiteSettings.ts's own catalogueUrl still carries.
              defaultValue: async ({ req }: { req: PayloadRequest }) => {
                const defaults = await readCatalogueDefaults(req)
                return defaults?.catalogueUrl || 'https://wear-run.help/catalogue'
              },
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
              // Same inheritance and the same `||` reasoning as catalogueUrl above.
              defaultValue: async ({ req }: { req: PayloadRequest }) => {
                const defaults = await readCatalogueDefaults(req)
                return defaults?.retiredMessage || DEFAULT_RETIRED_MESSAGE
              },
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
