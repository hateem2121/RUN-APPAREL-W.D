/**
 * Which version of the CMS Worker answered — the proof a deploy's pre-live checks need.
 *
 * WHY (2026-11-07). ci.yml uploads each new version at 0% of traffic and runs the post-deploy
 * checks against it BEFORE any visitor gets it, through Cloudflare's
 * `Cloudflare-Workers-Version-Overrides` header. When an override is not applied, Cloudflare routes
 * the request "according to the percentages" (Version overrides docs, read 2026-11-07) — to the OLD
 * version, silently — so the checks would pass while testing what is already live. The docs
 * recommend returning the version ID from the version metadata binding (`CF_VERSION_METADATA`,
 * already bound in wrangler.jsonc); scripts/version-overrides.mjs asks this address with and
 * without the header and fails unless it gets the new and the old version respectively.
 *
 * Answered in the default entrypoint BEFORE OpenNext and the page store, so nothing keeps it, on
 * every host the Worker serves. No page or route of the site starts with `/__`.
 */
export const WORKER_VERSION_PATH = '/__worker/version'

/** The CMS Worker (wrangler.jsonc), and the site-only Worker built from the same code (wrangler.site.jsonc). */
export const CMS_WORKER = 'run-apparel-viewer-cms'
export const SITE_ONLY_WORKER = 'run-apparel-site-only'

/**
 * Which of the two Workers this code is running as. wrangler.site.jsonc sets `WORKER_NAME`; the CMS
 * Worker sets nothing, so anything but the site-only name is the CMS Worker, as it always was.
 * @param {{ WORKER_NAME?: string } | undefined} env
 */
export function workerName(env) {
  return env?.WORKER_NAME === SITE_ONLY_WORKER ? SITE_ONLY_WORKER : CMS_WORKER
}

/**
 * @param {URL} url
 * @param {{ id?: string } | undefined} metadata
 * @param {string} [worker] this Worker's name (workerName)
 * @returns {Response | null}
 */
export function workerVersionResponse(url, metadata, worker = CMS_WORKER) {
  if (url.pathname !== WORKER_VERSION_PATH) return null
  return new Response(`${JSON.stringify({ worker, version: metadata?.id ?? null })}\n`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex',
    },
  })
}
