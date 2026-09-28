/**
 * Security headers for every redirect this Worker answers.
 *
 * ⚠️ OPENNEXT SENDS A REDIRECT BARE. OpenNext returns a matched redirect before it attaches
 * the site's own headers (`routingHandler.js`, docs/CLOUDFLARE-SETUP.md), so until the
 * domain move a Transform Rule on the wear-run.help zone added these to the www. and cms.
 * redirects. The move of 2026-09-28 added redirects that rule never sees — wear-run.help
 * itself, and www.wear-run.com on a different zone — so the Worker adds them now, on both
 * domains, from code a test can read. The .help rule may stay; it sets the same values.
 *
 * A redirect has no body worth loading, so the policy is the narrowest there is. HSTS is
 * left to each zone's own setting, as it was before.
 */
export const REDIRECT_SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'permissions-policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',
  'x-content-type-options': 'nosniff',
}

const REDIRECTS = new Set([301, 302, 303, 307, 308])

/**
 * The response with the headers above when it is a redirect; the SAME object otherwise.
 *
 * @param {Response} response
 * @returns {Response}
 */
export function withRedirectHeaders(response) {
  if (!REDIRECTS.has(response.status)) return response
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(REDIRECT_SECURITY_HEADERS)) headers.set(name, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
