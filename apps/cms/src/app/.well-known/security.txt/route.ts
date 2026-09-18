import { SECURITY_TXT } from '@run-apparel/shared'

/**
 * `/.well-known/security.txt` (RFC 9116) — decided 2026-09-18, live from the merge that
 * deploys it. The text lives in `packages/shared/src/securityTxt.ts`, the one source the
 * documents Worker and the viewer serve too, so the copies cannot drift apart.
 *
 * It answers on wear-run.help and directly on cms.wear-run.help (both listed as Canonical).
 * www. answers a 308 to the apex copy, which internet.nl follows.
 *
 * ⚠️ AT `src/app/`, OUTSIDE BOTH ROUTE GROUPS, for the reason `/robots.txt` and
 * `/llms.txt` are: `(frontend)/layout.tsx` is a full HTML document, and a text file wrapped
 * in `<html>` is not a text file.
 */
export const dynamic = 'force-static'

export function GET(): Response {
  return new Response(SECURITY_TXT, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
