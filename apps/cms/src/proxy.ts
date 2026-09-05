import { type NextRequest, NextResponse } from 'next/server'

/**
 * A per-request Content-Security-Policy for the PUBLIC pages only.
 *
 * ⚠️ THIS FILE IS `proxy.ts`, NOT `proxy.ts`. Next 16 deprecated the middleware
 * convention — `next build` prints "The middleware file convention is deprecated" and
 * points at a codemod. Same signature, same `config`, current name. Do not rename it
 * back to pick up an example from an older tutorial.
 *
 * ⚠️ THE MATCHER IS THE MOST IMPORTANT LINE IN THIS FILE. This Worker also serves the
 * Payload admin and the REST API, and next.config.mjs records a deliberate decision NOT
 * to put a full CSP on `/admin`: Payload's bundle needs inline styles and dynamic
 * imports, so a policy tight enough to be worth having would need a nonce threaded
 * through Payload's own document renderer, and one carrying 'unsafe-inline'
 * 'unsafe-eval' is a false sense of safety. That decision stands. This runs on the three
 * public routes and the 404, and nowhere else.
 *
 * WHY A NONCE AND NOT A HASH. Next inlines its own bootstrap and flight-data scripts,
 * so `script-src 'self'` alone would break every page. Hashes would have to be
 * recomputed on every build of every chunk; a nonce is regenerated per request and Next
 * applies it to its own tags automatically when it sees one in the CSP request header.
 * The JSON-LD blocks and the analytics beacon carry it explicitly, because Next does not
 * touch script tags the app renders itself.
 *
 * ⚠️ `strict-dynamic` IS WHAT MAKES THIS WORKABLE. Next's bootstrap script loads further
 * chunks; without it every one of those would need its own nonce. With it, a script the
 * nonced bootstrap loads is trusted, and `'self'` is retained purely as a fallback for
 * browsers that do not implement strict-dynamic.
 *
 * ⚠️ NO `upgrade-insecure-requests`, ON PURPOSE. The e2e suite and every local runtime
 * serve over http://localhost; that directive would rewrite their asset requests to
 * https and break the suite while production stayed fine — a gate that fails only where
 * nothing is wrong.
 */
export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll('-', '')

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://static.cloudflareinsights.com`,
    // Next injects the critical stylesheet inline during streaming, and the token
    // system uses no inline style attributes of its own. 'unsafe-inline' for STYLES
    // carries a fraction of the risk it carries for scripts — it cannot execute.
    "style-src 'self' 'unsafe-inline'",
    // Posters come from the media host in production; data: covers the SVG favicon.
    "img-src 'self' data: https://media.wear-run.help",
    "font-src 'self'",
    // The analytics beacon reports over fetch.
    "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com",
    "object-src 'none'",
    "base-uri 'self'",
    // There is no form on this site. If one is ever added, widen this deliberately —
    // it is the directive that stops a stolen page posting somewhere else.
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  // Next reads the nonce out of the CSP on the REQUEST headers to stamp its own script
  // tags, so it has to be set on both the forwarded request and the response.
  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('content-security-policy', csp)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('content-security-policy', csp)
  return response
}

export const config = {
  /*
   * The public pages only. Everything not listed here — `/admin`, `/api/*`,
   * `/_next/*`, `robots.txt`, `sitemap.xml`, static files — never enters this function.
   *
   * Written as an explicit list rather than a negative lookahead: a lookahead that is
   * subtly wrong fails OPEN, silently applying the policy to the admin, and the symptom
   * would be a broken login rather than an error naming this file.
   */
  matcher: ['/', '/products', '/contact'],
}
