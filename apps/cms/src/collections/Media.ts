import { APIError, type CollectionConfig } from 'payload'
import { isAdmin, isAdminFieldLevel, isAdminOrEditor } from '../access/roles'
import {
  IMAGE_MIME_TYPES,
  MODEL_MIME_TYPES,
  SIZE_WARNING_BYTES,
  checkMediaUpload,
} from './mediaRules'

// Built from the same two lists the media pickers filter on (mediaRules.ts), so
// a type that can be uploaded is always a type that can then be selected. They
// were separate literals until 2026-08-09 and nothing would have caught a drift.
// `MODEL_MIME_TYPES` already carries 'application/octet-stream' — browsers
// frequently upload .glb as a generic binary stream, and the hook below verifies
// the extension for those.
const ALLOWED_MIME_TYPES = [
  ...MODEL_MIME_TYPES,
  ...IMAGE_MIME_TYPES,
  // Extension, not a MIME type — deliberate. @payloadcms/ui builds the file
  // input's `accept` attribute by joining this array verbatim, and macOS has no
  // UTI for model/gltf-binary, so without a literal '.glb' the picker greys out
  // GLB files and they cannot be selected at all. Payload's `validateMimeType`
  // compares with `startsWith`, so this entry can never match a real MIME type —
  // it is inert for validation and only fixes the picker.
  '.glb',
]

export const Media: CollectionConfig = {
  slug: 'media',
  // See Products.ts — pinned against Payload v4 flipping the default to ON.
  versions: false,
  // BETA, accepted deliberately on 2026-08-10 against installed Payload 3.86.0:
  // the type's own doc comment on `Config.folders` reads "This feature may
  // change in minor versions until it is fully stable." At 100+ garments the
  // media library is ~1,000 files in one flat list — unusable — so the owner
  // took the beta risk. NOTE the property is top-level `folders`, not
  // `admin.folders`: verified against payload@3.86.0's own
  // `CollectionConfig`/`SanitizedCollectionConfig` types
  // (dist/collections/config/types.d.ts), which declare `folders` as a
  // sibling of `admin`, and against `sanitize.js`, which reads
  // `config.collections[i].folders` (not `.admin.folders`) to decide whether
  // to attach the hidden folder-relationship field.
  folders: true,
  labels: { singular: 'Photo or 3D file', plural: 'Photos & 3D files' },
  admin: {
    group: 'Content',
    description:
      'Every picture and finished 3D file used on the website. Shrunk 3D files arrive here on their own once your CLO upload has been processed — you rarely need to add anything by hand.',
  },
  access: {
    // Poster and model files are public by nature (they render on the public
    // viewer); document data contains nothing sensitive except the
    // admin-only source reference field below.
    read: () => true,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  upload: {
    mimeTypes: ALLOWED_MIME_TYPES,
    // No imageSizes: sharp-based processing is unavailable on Workers; posters
    // are pre-rendered/optimised before upload (see asset pipeline README).
  },
  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        const filename = (data?.filename ?? '') as string
        const { sizeWarning } = checkMediaUpload({
          filename,
          mimeType: (data?.mimeType ?? '') as string,
          filesize: (data?.filesize ?? 0) as number,
        })
        if (sizeWarning) {
          req.payload.logger.warn(
            `Media upload "${filename}" is ${(((data?.filesize ?? 0) as number) / 1024 / 1024).toFixed(1)} MB — heavier than the ${SIZE_WARNING_BYTES / 1024 / 1024} MB mobile guideline.`,
          )
        }
        return data
      },
    ],
    beforeDelete: [
      /**
       * Refuse to delete a file a published product is still using.
       *
       * This is the hole that left N001 live with an empty 3D stage: the publish
       * gate only runs when the PRODUCT is saved, and the database sets the
       * reference to NULL on delete. So deleting the model from the media library
       * walked straight past every check — the product stayed "published" and
       * "colours checked" while pointing at nothing, and the only symptom was a
       * blank box for anyone scanning the QR code.
       *
       * Blocking the delete is the right end to fix it. Silently un-publishing
       * the product would take a live page down without anyone being told.
       */
      async ({ id, req }) => {
        const inUse = await req.payload.find({
          collection: 'products',
          where: {
            and: [
              { status: { equals: 'published' } },
              {
                or: [
                  { glbAsset: { equals: id } },
                  { posterFallback: { equals: id } },
                  { 'colourways.posterPreview': { equals: id } },
                  { 'colourways.glbAsset': { equals: id } },
                ],
              },
            ],
          },
          limit: 5,
          depth: 0,
          req,
        })
        if (inUse.docs.length === 0) return

        const names = inUse.docs.map((doc) => `“${String(doc.productName)}”`).join(', ')
        throw new APIError(
          `This file is still being used by ${names}, which ${inUse.docs.length === 1 ? 'is' : 'are'} published. ` +
            'Deleting it would leave an empty space where the garment should be. ' +
            `Open ${inUse.docs.length === 1 ? 'that product' : 'those products'} first and either swap in a replacement file or set ${inUse.docs.length === 1 ? 'it' : 'them'} back to Draft.`,
          400,
        )
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: {
        description:
          'Descriptive alternative text, e.g. "Velocity Performance Tee in Navy, front three-quarter view".',
      },
    },
    {
      name: 'sourceReference',
      type: 'text',
      access: {
        read: isAdminFieldLevel,
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      admin: {
        description:
          'ADMIN ONLY — internal pointer to the CLO source (.zprj) location. Never exposed publicly and never uploaded here.',
      },
    },
    {
      name: 'sizeWarning',
      type: 'checkbox',
      admin: {
        readOnly: true,
        description: 'Automatically ticked when the file exceeds the 8 MB mobile guideline.',
      },
      hooks: {
        beforeChange: [
          ({ siblingData }) => ((siblingData?.filesize ?? 0) as number) > SIZE_WARNING_BYTES,
        ],
      },
    },
    {
      name: 'artworkVerdict',
      type: 'select',
      label: 'Printed artwork',
      options: [
        { label: 'Not checked', value: 'unknown' },
        { label: 'Looks fine', value: 'ok' },
        { label: 'Damaged — will not publish', value: 'damaged' },
      ],
      admin: {
        readOnly: true,
        description:
          'Written by the shrink robot. “Damaged” means printed logos or lettering were torn while the file was made smaller, and the product will refuse to publish until the file is replaced.',
      },
    },
    {
      name: 'artworkOverrideReason',
      type: 'textarea',
      label: 'Publish anyway — reason',
      admin: {
        // Only meaningful on a damaged file; hidden otherwise so the normal path
        // shows one fewer thing to wonder about.
        condition: (_, siblingData) => siblingData?.artworkVerdict === 'damaged',
        description:
          'Write why this file is acceptable despite the warning — e.g. “this garment has no printed artwork”. Any text here lets it publish, and it stays on the record.',
      },
    },
  ],
}
