import { SECURITY_TXT } from '@run-apparel/shared'
import { workerResponseHeaders } from './securityHeaders'

/**
 * `/.well-known/security.txt` (RFC 9116) — decided 2026-09-18, live from the merge that
 * deploys it. The text is `packages/shared/src/securityTxt.ts`, the one source the site and
 * the documents Worker serve too, so this is code rather than a copy in `public/`.
 *
 * ⚠️ A WORKER-BUILT RESPONSE, so it carries `workerResponseHeaders()`: `_headers` reaches
 * only responses that come out of `env.ASSETS.fetch()`, and a `new Response(...)` would
 * otherwise ship with every security header absent (measured 2026-08-12).
 *
 * Returns null for anything else, so the caller falls through unchanged.
 */
export const SECURITY_TXT_PATH = '/.well-known/security.txt'

export function securityTxtResponse(request: Request): Response | null {
  if (new URL(request.url).pathname !== SECURITY_TXT_PATH) return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const headers = { ...workerResponseHeaders(), 'Cache-Control': 'public, max-age=3600' }
  return new Response(request.method === 'HEAD' ? null : SECURITY_TXT, { status: 200, headers })
}
