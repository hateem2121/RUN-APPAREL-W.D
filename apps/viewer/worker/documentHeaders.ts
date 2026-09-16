/**
 * Cross-origin headers for the HTML this Worker returns (audit SE-05).
 *
 * Measured live 2026-09-16: the garment pages answered with neither header, while the
 * marketing site's five pages carry both.
 *
 * WHY HERE AND NOT IN `_headers`: a `/*` rule also matches `/assets/*` and `/og/*`, and
 * Cloudflare comma-joins duplicate headers from every matching rule (apps/viewer/CLAUDE.md),
 * so no `_headers` pattern reaches the SPA routes alone. The Worker sees exactly the HTML.
 *
 * `same-origin` for both. COOP severs `window.opener` for cross-origin windows: nothing
 * here needs it, and the WhatsApp and email links open without it. CORP stops another
 * origin embedding the page as a subresource. COEP itself stays absent: it would demand
 * CORP from every poster.
 *
 * ⚠️ THE CMS LIVE PREVIEW STILL WORKS, AND ITS POP-OUT CHANGES ONE THING. Products.ts
 * shows this page in an iframe on cms.wear-run.help. Measured 2026-09-17 in Chromium 151,
 * Firefox 153 and WebKit 26.5: a cross-origin frame loads despite CORP `same-origin` when
 * the embedder sets no COEP (the CMS sets none), and is refused when it does. Payload's
 * "pop out" window also still opens, but COOP leaves the admin no handle to it, so Payload
 * reads it as closed within a second and shows the side panel again. The viewer never
 * listened to Payload's preview messages, so nothing is lost. Not a bug to chase.
 *
 * PURE, like noTransform.ts: index.ts needs HTMLRewriter and cannot be unit-tested, so
 * the decision lives here where vitest can reach it.
 */
export const DOCUMENT_ISOLATION: Readonly<Record<string, string>> = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
}

/** 200 or the branded 404, and HTML. A 304 has no body and is returned untouched. */
export function isDocumentResponse(response: Response): boolean {
  return (
    (response.status === 200 || response.status === 404) &&
    (response.headers.get('content-type') ?? '').includes('text/html')
  )
}

export function withDocumentIsolation(response: Response): Response {
  if (!isDocumentResponse(response)) return response
  // `new Response(body, response)` copies every header `_headers` applied (noTransform.ts).
  const next = new Response(response.body, response)
  for (const [key, value] of Object.entries(DOCUMENT_ISOLATION)) next.headers.set(key, value)
  return next
}
