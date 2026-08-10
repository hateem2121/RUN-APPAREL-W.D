# CLAUDE.md — apps/viewer

Split out of the root `CLAUDE.md` on 2026-08-10 by `/doctor`: the root file had reached
39,674 chars, 326 short of the ~40,000-char point where Claude Code warns that a memory
file is too large. These traps are reachable only by editing files under `apps/viewer/`,
so they load when they matter instead of in every session. Nothing below was reworded.

Root `CLAUDE.md` still holds the cross-cutting traps — read it first.

## Traps — each of these has already cost a session

- **React sets `src` on a custom element as a PROPERTY, never an attribute.**
  `el.getAttribute('src')` on `<model-viewer>` is always `null` — its attribute
  list carries `camera-orbit`, `tone-mapping` and a dozen others and no `src`.
  Code that keyed off it silently compared empty strings forever.
- **`webglcontextlost` never reaches your listener.** It fires on the `<canvas>`
  inside model-viewer's shadow root and is not a composed event, so no listener
  on the host sees it, capture phase or not. model-viewer 4.x also renders into a
  *shared offscreen* canvas — the one in the shadow root returns a `2d` context,
  so `WEBGL_lose_context` on it is a no-op. The real contract is model-viewer's
  own `error` event with `detail.type === 'webglcontextlost'`.

- **A grid item's `min-height: auto` silently beats `max-height: 100%`.** The
  loading poster overflowed its stage by 926px for months this way — measured
  498×1500 inside 546×574 — and looked like the image was *tiling*, because the
  overflow was clipped by the sections above and below. `max-width` alone still
  left it at 623px. `min-height: 0` is the line that actually fixes it. Same trap
  as the familiar `min-width: 0` on flex children.

- **The CSP violation on every page load is Bot Fight Mode, NOT Web Analytics.**
  On 2026-08-05 it was diagnosed as Web Analytics' "Automatic Setup" injecting a
  beacon bootstrap, and that is **wrong** — corrected 2026-08-06 by reading the
  injected script instead of inferring it. It is Cloudflare's **JavaScript
  Detections** (`window.__CF$cv$params`, loading
  `/cdn-cgi/challenge-platform/scripts/jsd/main.js`), which is bundled with Bot
  Fight Mode and, per Cloudflare's docs, *"automatically enabled and cannot be
  disabled"* for Bot Fight Mode customers. Web Analytics was never involved: the
  delivered HTML had **zero** matches for `cloudflareinsights`, and a live load made
  **zero** requests to it.
  **No hash can ever cover it.** The script embeds a per-request ray id and
  timestamp, so its sha256 differs on every single load — measured three values in
  under a minute (`YQqe7Ux…`, `jgl9AA6h…`, `eXCOhXoR…`). Anyone "fixing" this by
  pinning a hash is chasing a value that changed before they pasted it.
  **RESOLVED 2026-08-06 — and the fix is not in the dashboard.** Turning Bot Fight
  Mode off is NOT sufficient: `enable_js` is a **separate zone flag that does not
  clear with it**, and the Free plan renders it as read-only status text
  ("JS Detections: On", tooltip "enabled by default when you turn on Bot fight
  mode") with no control. Verified via the API — `fight_mode: false` and
  `enable_js: true` at the same time.
  Fix, from an authenticated dashboard session:
  ```js
  // GET first; PUT REPLACES the config, so echo every field back.
  // PATCH returns 405 — this endpoint is PUT-only.
  const cur = (await (await fetch(`/api/v4/zones/${ZONE}/bot_management`,
    {credentials:'include'})).json()).result
  const body = {...cur, enable_js: false}; delete body.using_latest_model
  await fetch(`/api/v4/zones/${ZONE}/bot_management`,
    {method:'PUT', credentials:'include',
     headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
  ```
  Zone `wear-run.help` = `805d8ae5fa0dea40c960a2561f66d141`. Injection stopped
  immediately; the page now serves ONE inline script (our theme bootstrap) and logs
  no CSP error.
  Two rejected alternatives, for the record:
  - **`Cache-Control: no-transform` on the HTML** — documented to stop the
    injection, but it cannot be delivered to the SPA routes from `_headers` on this
    deployment. Tried and measured; see the `_headers` trap below.
  - **CSP nonces** — Cloudflare adds matching nonces to what it injects, by parsing
    your CSP response header. Not usable from a static `_headers` file: a nonce must
    be per-request, so it would need the viewer Worker to rewrite the header per
    response. Nonces set via `<meta>` are explicitly unsupported.
  Never widen to `'unsafe-inline'`.

- **`_headers` rules that both match are COMBINED, not overridden — duplicate
  headers are joined with a comma.** There is no "most specific wins" here, and
  assuming otherwise corrupts `Cache-Control`: putting one on `/*` appends it to
  the `/assets/*` rule and ships
  `public, max-age=31536000, immutable, public, max-age=0, must-revalidate` on
  every hashed bundle. Placeholders are no escape — `/:product/:colourway` also
  matches `/assets/index-abc.js`. Consequence: there is **no `_headers` pattern
  that reaches the SPA routes without also hitting the assets**, because matching
  is on the REQUEST path and the SPA fallback keeps the visitor's URL.
  A rule on `/index.html` reaches *only* a literal `/index.html`. Workers Static
  Assets serves SPA-fallback HTML with its own default of
  `public, max-age=0, must-revalidate` — **byte-identical to what that rule sets
  minus the added directive**, so comparing the two paths shows a match and reads
  as confirmation that the rule applied. It did not. Verify a header rule by
  changing it to something the default is not.

- **`_headers` DOES survive `env.ASSETS.fetch()` — measured 2026-08-08, so the
  viewer can grow a Worker without losing its CSP.** This was an open unknown
  blocking per-garment link previews: `apps/viewer/wrangler.jsonc` is assets-only,
  injecting per-garment OG tags needs a Worker, and Cloudflare's docs say only that
  `_headers` is "supported natively" — never what happens to a response the Worker
  fetched through the binding. If it were applied by the asset router *before* the
  binding, adding a Worker would silently drop CSP and HSTS on every page, and no
  test in this repo would catch it.
  Measured on wrangler 4.114.0, `compatibility_date` 2026-07-01, against a fixture
  carrying a deliberately non-default `X-Headers-Probe` (per the trap above — a
  default-shaped value proves nothing). On the SPA-fallback route `/n001/wine`,
  **all three** of assets-only, `return env.ASSETS.fetch(request)`, and
  `new Response(response.body, response)` returned identical CSP, HSTS and probe
  headers. A `/__worker-marker` route returned `X-Worker-Ran: yes` in the same run,
  so the Worker was genuinely in the path rather than bypassed — without that
  control the result would have been indistinguishable from the Worker never
  running. The same run also re-confirmed the combining rule above: a hashed asset
  came back with `x-headers-probe` **twice**, once per matching rule.
  ⚠️ Measured on `wrangler dev` (local), not against the edge. It exercises the
  same asset-serving implementation, but if a production deploy ever adds a Worker
  here, re-check the live response headers once rather than trusting this line.
  **That Worker now exists** (`apps/viewer/worker/index.ts`, 2026-08-08) and the
  headers were re-confirmed through it locally — CSP, HSTS, Permissions-Policy,
  Referrer-Policy and nosniff all present on a rewritten response. Still not
  re-checked against the live edge; do that once after the first deploy.

- **Per-garment link previews are CRAWLER-ONLY, and the number is why.** Measured
  2026-08-08, warm connection, five requests each: the viewer's static HTML is
  **0.106–0.155 s** to first byte, `cms /api/health` is **0.428–0.657 s**, and
  `cms /api/public/viewer/n001/wine` is **1.77–2.27 s**. The payload endpoint is
  not edge-cached on either host (`cf-cache-status` empty on `cms.wear-run.help`
  and the workers.dev URL alike — a Worker's own response does not pass through
  the edge cache, so its `s-maxage=60` buys nothing). Rewriting for everyone would
  make every QR scan ~20x slower to first byte to fix something no visitor can
  see, so `worker/index.ts` returns `env.ASSETS.fetch(request)` untouched unless
  the user-agent matches a crawler. A crawler that is NOT matched falls through to
  index.html's generic card, i.e. exactly what shipped the day before — the
  failure mode of a miss is "no worse than yesterday". `scripts/smoke-viewer-preview.mjs`
  carries the negative control that a plain browser is *not* rewritten; without it,
  someone "simplifying" the check would ship the 2 s regression and it would be
  diagnosed as "the site got slow", somewhere else entirely.
  Two more measured facts from building it. **Asset requests never reach the
  Worker** — logged every entry to the handler: `/assets/index-*.js`,
  `/og/n001/wine.jpg` and `/` produced no line, `/n001/lime` produced one — so
  `/assets/*` keeps its zero-overhead path as long as `run_worker_first` stays
  unset. And **an HTMLRewriter selector that matches nothing is a silent no-op,
  not an error**: delete a `<meta>` from `index.html` and the Worker keeps
  returning 200 while quietly ceasing to set it on every link, which is why
  `worker/preview.test.ts` asserts each rewritten tag still exists there.

- **`og:image` must not be the WebP poster, even though every browser reads WebP.**
  Link crawlers are not browsers: LinkedIn documents JPG/PNG/GIF only, and iMessage
  and WhatsApp are both unreliable with WebP. All five N001 posters are
  `image/webp` (checked against the live payload), so pointing `og:image` at
  `media.wear-run.help` directly shows a picture on Slack and X and *nothing* on
  the two channels most likely to carry a link to a lead. `pnpm og:cards <slug>`
  transcodes the rendered posters into `apps/viewer/public/og/<product>/<colour>.jpg`
  (62–75 KB each at quality 76) and regenerates the manifest the Worker reads.
  The Worker still falls back to the poster when no card exists — the right
  garment on some platforms beats a polished card of a different garment on all of
  them — so skipping the command degrades, it does not break.

- **A build-time CSP cannot cover an edge-injected script — by construction.**
  `scripts/csp.mjs` hashes the inline scripts present in the *built*
  `dist/index.html`; anything Cloudflare injects at the edge arrives after those
  hashes exist. This is why the beacon is embedded as a `<script src>` (no hash
  needed) rather than left to Automatic Setup. A manual embed POSTs to
  `cloudflareinsights.com` while automatic setup posts to your own origin, so those
  two `connect-src` entries are not interchangeable. The policy is a pure function
  in `scripts/csp.mjs` with tests; `gen-headers.mjs` is only the I/O around it.

