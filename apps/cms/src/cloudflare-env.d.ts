/**
 * Typed bindings for this Worker, matching wrangler.jsonc.
 * (`wrangler types` can regenerate a fuller version of this file.)
 */
declare global {
  interface CloudflareEnv {
    D1: D1Database
    R2: R2Bucket
    ASSETS: Fetcher
    CMS_PUBLIC_URL?: string
    PUBLIC_MEDIA_BASE_URL?: string
    VIEWER_ALLOWED_ORIGINS?: string
    VIEWER_API_CACHE_SECONDS?: string
    EMAIL_FROM_ADDRESS?: string
    EMAIL_FROM_NAME?: string
    PAYLOAD_SECRET?: string
    RESEND_API_KEY?: string
  }
}

export {}
