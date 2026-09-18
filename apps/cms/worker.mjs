/**
 * The site's Worker entry: OpenNext's generated handler, wrapped by the script guard
 * (SE-04, decided 2026-09-18, live from the merge that deploys it).
 *
 * Every decision is in cspNonce.mjs (pure, tested). This file only applies them.
 *
 * ⚠️ IT FAILS OPEN. Any exception, or a policy it does not recognise, returns OpenNext's
 * response unchanged. Every page then keeps working under PUBLIC_PAGE_CSP, which still
 * carries 'unsafe-inline'. That state is loud, not silent:
 * scripts/public-security-probe.mjs fails after every deploy and daily when a public page's
 * script-src still allows 'unsafe-inline', and the `[csp-nonce]` lines reach Workers logs.
 *
 * ⚠️ `next start` NEVER RUNS THIS FILE, so the CMS e2e suite tests the fallback, not the
 * guard. Prove the guard with e2e/csp-nonce-edge.mjs against `opennextjs-cloudflare preview`
 * (apps/cms/CLAUDE.md, "Browser tests for the public site").
 *
 * ⚠️ `export *` IS DELIBERATE. OpenNext exports Durable Object classes (DOQueueHandler,
 * DOShardedTagCache and BucketCachePurge on 1.20.2), and an explicit list would silently
 * drop one a later OpenNext adds. `export *` never re-exports `default`, which this file
 * replaces.
 */
import openNext from './.open-next/worker.js'
import { newNonce, nonceable, noncedHeaders } from './cspNonce.mjs'

export * from './.open-next/worker.js'

export default {
  async fetch(request, env, ctx) {
    const response = await openNext.fetch(request, env, ctx)
    try {
      if (!nonceable(response)) return response
      const nonce = newNonce()
      const headers = noncedHeaders(response.headers, nonce)
      if (headers === null) {
        console.error('[csp-nonce] the public-page policy changed shape; serving the fallback')
        return response
      }
      const init = { status: response.status, statusText: response.statusText, headers }
      if (response.body === null) return new Response(null, init)
      // Every <script>: inline, external and JSON-LD. The nonce is harmless on the last two,
      // and it keeps working if 'strict-dynamic' is ever added.
      const rewritten = new HTMLRewriter()
        .on('script', {
          element(element) {
            element.setAttribute('nonce', nonce)
          },
        })
        .transform(response)
      return new Response(rewritten.body, init)
    } catch (error) {
      console.error('[csp-nonce] failed; serving the fallback', error)
      return response
    }
  },
}
