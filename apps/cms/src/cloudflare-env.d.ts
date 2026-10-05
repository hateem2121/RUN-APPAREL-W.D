/**
 * Typed bindings for this Worker, matching wrangler.jsonc.
 * (`wrangler types` can regenerate a fuller version of this file.)
 */
declare global {
  interface CloudflareEnv {
    D1: D1Database
    R2: R2Bucket
    // Private ingest bucket for un-processed raw CLO uploads (no public domain).
    R2_INGEST: R2Bucket
    // Private bucket for files attached to contact-form inquiries (no public domain).
    R2_INQUIRY: R2Bucket
    // Producer queue: a raw upload enqueues a shrink job consumed by apps/shrink.
    SHRINK_QUEUE?: Queue
    ASSETS: Fetcher
    // The viewer Worker: worker.mjs forwards garment pages and its files to it (2026-09-28).
    VIEWER?: Fetcher
    // The stored page cache (pageCache.mjs, 2026-10-04): the content version every CMS save
    // rewrites, and the deploy version, which together key every kept page.
    SITE_CACHE?: KVNamespace
    CF_VERSION_METADATA?: WorkerVersionMetadata
    CMS_PUBLIC_URL?: string
    PUBLIC_MEDIA_BASE_URL?: string
    VIEWER_ALLOWED_ORIGINS?: string
    EMAIL_FROM_ADDRESS?: string
    EMAIL_FROM_NAME?: string
    PAYLOAD_SECRET?: string
    RESEND_API_KEY?: string
  }
}

export {}
