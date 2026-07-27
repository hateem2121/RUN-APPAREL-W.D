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
    // ⚠️ DO NOT ADD `mimeTypes` HERE. Setting it breaks every upload over 50 MB —
    // i.e. exactly the raw CLO exports this inbox exists for. The chain (verified
    // against payload 3.86.0 / @payloadcms/storage-r2 3.86.0, which are `latest`):
    //   1. storage-r2 `getFile.js` deliberately returns an EMPTY body when
    //      `fileSize > 50MB && clientUploadContext` ("or the Worker will run out
    //      of memory"), and this collection uses clientUploads.
    //   2. payload `addDataAndFileToRequest.js` builds `req.file.data` from that
    //      response → a 0-byte buffer.
    //   3. payload `checkFileRestrictions.js` runs ONLY when `mimeTypes` is set;
    //      `fileTypeFromBuffer(empty)` → undefined, so it falls back to
    //      `getFileTypeFallback()`, whose extensionMap has no `glb` entry → it
    //      guesses `text/plain`.
    //   4. `validateMimeType('text/plain', [...])` → false → the upload dies with
    //      "File type text/plain (from extension glb) is not allowed." — AFTER
    //      every chunk has already transferred.
    // An empty allow-list makes `validateMimeType` short-circuit to true and stops
    // the field-level `mimeTypeValidator` from being attached at all. It also drops
    // the `accept` attribute, which is what greyed out .glb in the macOS picker.
    // Upstream has related GLB mimetype bugs (payloadcms/payload#7408, #12620,
    // #8673, #12905) but not this >50 MB path; re-test before reinstating.
    // File-type safety is unaffected: checkRawUpload() below is the real gate.
    allowRestrictedFileTypes: true,
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
    beforeChange: [
      /**
       * Confirm the uploaded bytes actually reached the ingest bucket before we
       * commit a document that claims they did.
       *
       * Payload does NOT do this itself. With `clientUploads` the browser puts
       * the file in R2 first and the document is created afterwards from
       * client-supplied metadata; `addDataAndFileToRequest` fetches the object
       * back through the storage adapter's staticHandler, and a **404 there is
       * treated as success** — the response is truthy, so `req.file.data`
       * becomes an empty buffer and the create proceeds. The result is a record
       * with a correct-looking name and size pointing at nothing, no error
       * anywhere, and a shrink job that fails minutes later with an opaque
       * "Could not read raw object ... (404)".
       *
       * That is exactly what happened on 2026-07-27 with a 382 MB export. The
       * upload code itself is sound — the same file, same chunk loop and same
       * document create were reproduced end-to-end against a local CMS and
       * succeeded — so the realistic cause is an interrupted transfer. Fail it
       * here, loudly and in plain language, instead of letting it through.
       */
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        const filename = data?.filename as string | undefined
        if (!filename) return data

        const cf = await getCloudflareContext({ async: true }).catch(() => null)
        const bucket = (cf?.env as { R2_INGEST?: R2Bucket } | undefined)?.R2_INGEST
        // No binding (local dev without remote bindings) — nothing to verify.
        if (!bucket) return data

        const prefix = (data?.prefix as string | undefined) ?? ''
        const key = prefix ? `${prefix}/${filename}` : filename
        const head = await bucket.head(key).catch(() => null)
        if (head) return data

        req.payload.logger.error(
          `Raw upload rejected: "${key}" is not in the ingest bucket after the client upload completed.`,
        )
        throw new Error(
          'Your file did not finish uploading, so there is nothing to shrink. ' +
            'Nothing was saved. Please try again — keep this tab open and in the ' +
            'foreground until it finishes, and stay on the same network. ' +
            'If it keeps failing, tell your developer: the file never reached the ingest bucket.',
        )
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
