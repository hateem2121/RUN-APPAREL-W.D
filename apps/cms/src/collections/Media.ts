import type { CollectionConfig } from 'payload'
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
  admin: {
    group: 'Content',
    description:
      'Optimised, pipeline-processed GLB models and poster images only. Run every product GLB through the asset pipeline (merge + validate) before uploading — never upload raw CLO exports. Posters: WebP/AVIF preferred. Keep files under 8 MB where possible.',
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
