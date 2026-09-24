/**
 * Keeps the CMS browser tests off the production media host.
 *
 * ⚠️ WHY THIS EXISTS. `payload.config.ts` reads `PUBLIC_MEDIA_BASE_URL` binding-first
 * on purpose (see the comment there), so a locally built-and-served CMS still emits
 * poster URLs on `https://media.wear-run.help` — production's real URL shape, not a
 * local convention. `serve.mjs` explains the same thing from the server side. That is
 * deliberate: `projectPublic.ts` must be proven against the shape production actually
 * emits, not a shape only this suite has ever seen. But it means every browser this
 * suite drives makes a REAL request to a REAL production host, and `/products` loads
 * its first card's poster `eager`/`high` priority, which blocks `load`.
 *
 * Measured 2026-09-24, during Cloudflare's Islamabad-area incident: `media.wear-run.help`
 * connected and then sent 0 bytes for 20+ seconds for the (renamed, now-missing)
 * `n001-wine-poster.webp` key, so `page.goto('/products')` timed out at 30s. CI stayed
 * green only because a runner's request to that same missing key happened to fail fast
 * instead of hanging — the suite was never actually independent of that host's mood.
 * See ~/.claude/projects/…/memory/cms-e2e-products-hangs-on-prod-media.md for the trace.
 *
 * This fixture fulfils every request to that host locally, before it ever reaches the
 * network, so a stall, a slow edge or an outright outage on media.wear-run.help cannot
 * hang or flake this suite — while every spec that asserts the URL still starts with
 * `https://media.wear-run.help` (the point of the exercise) keeps seeing exactly that:
 * we only ever supply the RESPONSE, never rewrite the request.
 *
 * Every spec imports `test`/`expect` from here instead of `@playwright/test` directly,
 * so the interception is automatic — a spec cannot forget to add it, and cannot
 * accidentally depend on the real host by omission.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as base, expect, type Route } from '@playwright/test'

// Matches the convention already used ad hoc in pages.spec.ts's own `page.route()` call,
// kept identical so the two never silently diverge in what they consider "the media host".
const MEDIA_HOST_PATTERN = '**media.wear-run.help/**'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

// Real, decodable 2x2 images (not hand-rolled bytes) so a page that actually paints the
// poster — rather than just reading its `src` — has something real to paint.
const FIXTURE_BODIES: Record<string, Buffer> = {
  '.webp': readFileSync(join(FIXTURES, 'offline-poster.webp')),
  '.png': readFileSync(join(FIXTURES, 'offline-poster.png')),
}
// Any other declared image extension gets the PNG bytes — the browser decodes by
// content sniffing/Content-Type, not by trusting the URL's extension, so this is a
// faithful stand-in without needing one real file per format.
const FALLBACK_IMAGE_BODY = FIXTURE_BODIES['.png']

if (!existsSync(FIXTURES)) {
  throw new Error(`[cms-e2e] offlineMedia fixtures missing at ${FIXTURES}`)
}

async function fulfilOffline(route: Route) {
  const url = new URL(route.request().url())
  const ext = /\.[a-z0-9]+$/i.exec(url.pathname)?.[0]?.toLowerCase()
  const contentType = ext ? IMAGE_CONTENT_TYPES[ext] : undefined

  if (contentType) {
    await route.fulfill({
      status: 200,
      contentType,
      // No Cross-Origin-Resource-Policy: production's real header there is `same-site`,
      // which is exactly what makes `localhost` (not same-site with media.wear-run.help)
      // unable to embed it — see navbar.spec.ts's CORP exemption. Leaving it unset (or
      // permissive) here means the fixture never reproduces that unrelated restriction.
      headers: { 'cross-origin-resource-policy': 'cross-origin' },
      body: FIXTURE_BODIES[ext ?? ''] ?? FALLBACK_IMAGE_BODY,
    })
    return
  }

  // Anything on this host that isn't an image request (there shouldn't be any — the
  // suite only ever asks it for posters) gets an honest, fast 404 rather than a hang.
  await route.fulfill({
    status: 404,
    contentType: 'text/plain',
    body: 'not found (apps/cms/e2e/offlineMedia.ts fixture: media.wear-run.help is never reached by this suite)',
  })
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(MEDIA_HOST_PATTERN, fulfilOffline)
    await use(context)
  },
})

export { expect }
export type { Page } from '@playwright/test'
