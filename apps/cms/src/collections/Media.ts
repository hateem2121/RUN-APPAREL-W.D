import { APIError, type CollectionConfig } from 'payload'
import { isAdmin, isAdminFieldLevel, isAdminOrEditor } from '../access/roles'
import { SIZE_WARNING_BYTES, checkMediaUpload } from './mediaRules'

const ALLOWED_MIME_TYPES = [
  'model/gltf-binary',
  'image/webp',
  'image/avif',
  'image/jpeg',
  'image/png',
  // Browsers frequently upload .glb as a generic binary stream; a hook below
  // verifies the extension for these.
  'application/octet-stream',
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
  ],
}
