import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../access/roles'
import { checkRawUpload } from './rawRules'

/**
 * RawUploads — the PRIVATE ingest inbox for un-processed CLO exports.
 *
 * The owner uploads one big raw GLB here (spaces in the name and ~350 MB are
 * fine). Uploads stream directly to a private ingest R2 bucket in 5 MB chunks
 * (clientUploads, wired in payload.config.ts), so they never hit the ~100 MB
 * Worker body limit or the "endless spinner". A queue job then shrinks the file
 * in a Container and creates a small, guardrailed Media document from the
 * result — see docs/RAW-UPLOAD-PIPELINE.md.
 *
 * SAFETY: this collection is admin/editor-only (never public) and its bucket has
 * no public domain, so a raw file can never become buyer-facing. Only the
 * *shrunk* output re-enters the public Media collection, where the 40 MB
 * guardrail (mediaRules.ts) still applies.
 */

const ALLOWED_MIME_TYPES = [
  'model/gltf-binary',
  // Browsers frequently upload .glb as a generic binary stream; the
  // beforeValidate hook verifies the .glb extension for these.
  'application/octet-stream',
]

/** Message shape enqueued for the shrink Container (see apps/shrink). */
export interface ShrinkJobMessage {
  rawUploadId: number | string
  filename: string
  prefix: string | null
}

export const RawUploads: CollectionConfig = {
  slug: 'raw-uploads',
  admin: {
    group: 'Content',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'status', 'targetProduct', 'resultGlb'],
    description:
      'Upload your raw CLO export here — big files and messy names are fine. It is shrunk automatically. When Status shows “ready”, open the linked product to review the colours and Publish. These files are private and never shown to customers.',
  },
  access: {
    // PRIVATE: never public. Editors run the flow; the shrink robot updates via
    // an editor API key; only admins delete.
    read: isAdminOrEditor,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  upload: {
    mimeTypes: ALLOWED_MIME_TYPES,
    // No imageSizes: sharp-based processing is unavailable on Workers, and raw
    // GLBs are not images. disableLocalStorage is set by the r2Storage plugin.
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        // Only validate when a file is actually part of this write (an upload).
        // The robot's later status/report/resultGlb updates carry no filename, so
        // they must skip the GLB checks rather than be rejected as "not a GLB".
        if (data?.filename) {
          checkRawUpload({
            filename: data.filename as string,
            mimeType: (data?.mimeType ?? '') as string,
            filesize: (data?.filesize ?? 0) as number,
          })
        }
        return data
      },
    ],
    afterChange: [
      // On upload (create), enqueue a shrink job. Guarded so it no-ops cleanly
      // when the queue binding is absent (e.g. Phase 1 before the queue exists,
      // or local dev), and so the robot's own status updates don't re-enqueue.
      async ({ doc, operation, req, context }) => {
        if (context?.skipShrinkEnqueue) return doc
        if (operation !== 'create') return doc
        if (!doc?.filename) return doc

        try {
          const cf = await getCloudflareContext({ async: true }).catch(() => null)
          const queue = (cf?.env as { SHRINK_QUEUE?: Queue<ShrinkJobMessage> } | undefined)
            ?.SHRINK_QUEUE
          if (!queue) {
            req.payload.logger.warn(
              `Raw upload ${doc.id} saved but SHRINK_QUEUE is not bound — no shrink job enqueued.`,
            )
            return doc
          }
          await queue.send({
            rawUploadId: doc.id,
            filename: doc.filename as string,
            prefix: (doc.prefix as string | undefined) ?? null,
          })
          req.payload.logger.info(`Queued raw upload ${doc.id} (${doc.filename}) for shrinking.`)
        } catch (error) {
          req.payload.logger.error(
            `Failed to enqueue raw upload ${doc?.id}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'targetProduct',
      type: 'relationship',
      relationTo: 'products',
      admin: {
        description:
          'Which product this garment is for. Helps you find the result afterwards; you still attach and publish it yourself.',
      },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'queued',
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Processing', value: 'processing' },
        { label: 'Ready to review', value: 'ready' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Set automatically. “Ready to review” means the shrunk GLB is waiting below.',
      },
    },
    {
      name: 'resultGlb',
      type: 'upload',
      relationTo: 'media',
      admin: {
        readOnly: true,
        description: 'The shrunk, pipeline-processed GLB the robot produced. Attach this to the product.',
      },
    },
    {
      name: 'report',
      type: 'textarea',
      admin: {
        readOnly: true,
        description:
          'The pipeline report: final size, the colour variants found in the file, and any warnings. Read this before publishing.',
      },
    },
    {
      name: 'variantMapping',
      type: 'textarea',
      admin: {
        description:
          'Optional note to yourself, e.g. which CLO “Colorway” maps to which colourway ID (Colorway 2 = N001-NAVY). The viewer switches colours by the variant names inside the GLB.',
      },
    },
  ],
}
