---
paths:
  - "apps/viewer/worker/**"
  - "apps/viewer/scripts/**"
  - "apps/viewer/public/**"
---

# Viewer headers, CSP and the edge

Moved here from `apps/viewer/CLAUDE.md` on 2026-09-26, word for word.

## Traps

- **🟡 The inline-script CSP violation is Cloudflare PRECURSOR, and it is NOT fixed.**
  Called Web Analytics (wrong), then JavaScript Detections and "RESOLVED 2026-08-06"
  (also wrong — `enable_js:false` is Precursor's FINGERPRINT; Cloudflare disables JSD
  when Precursor is on). Root-caused 2026-09-04, live as Sentry VIEWER-8, **archived not
  resolved** because it still fires. No hash can cover it (per-request ray id) and
  nonces are impossible from a static `_headers`; never widen to `'unsafe-inline'`.
  🟡 **Only `sec-fetch-mode: navigate` reproduces it — plain `curl` reports it fixed.**
  Nothing visitor-facing is broken. `docs/VIEWER-CSP-BOT-FIGHT-MODE.md`.

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

- **Per-garment link previews are CRAWLER-ONLY, and the number is why.** Measured
  2026-08-08, warm connection, five requests each: the viewer's static HTML is
  🟢 **0.106–0.155 s** to first byte, `cms /api/health` is **0.428–0.657 s**, and
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

- **🟢 `_headers` is applied by the STATIC ASSET HANDLER, so it survives
  `env.ASSETS.fetch()` and NEVER reaches a response the Worker builds itself.** Both
  halves measured on the live edge 2026-08-12, same route:
  ```
  200 asset-served:  csp, hsts, permissions-policy, referrer-policy, nosniff  ALL PRESENT
  400 Worker-built:  ALL FIVE ABSENT
  ```
  🟡 That is why `worker/securityHeaders.ts` is KEPT with no caller left — the Worker
  currently builds no response of its own, and the next one that carries HTML must
  not re-learn this in production. `apps/viewer/scripts/csp.test.ts` pins its values
  against `buildHeadersFile()`'s `/*` rule so the two copies cannot drift, and fails
  if a SIXTH header is added to `_headers` and not to it.
  🟡 **Two things made that measurement trustworthy, and both are easy to omit.** The
  probe header carried a deliberately NON-DEFAULT value (a default-shaped one proves
  nothing — see the `_headers` combining trap above), and a `/__worker-marker` route
  returning `X-Worker-Ran: yes` proved the Worker was in the path at all; without it
  the result is indistinguishable from the Worker never running.
  🟡 **The e2e fixture could never have caught the Worker-built half, because the
  fixture was too GOOD:** `e2e/serve.mjs` sets `GLOBAL_HEADERS` on every response, so
  its 400 was always correct while production's was not. That is the root
  `CLAUDE.md`'s fixtures-cannot-exhibit-the-failure pattern INVERTED — the usual
  instinct is to make a fixture more faithful, and here it was already ahead of
  production.

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
  `apps/viewer/scripts/csp.mjs` hashes the inline scripts present in the *built*
  `dist/index.html`; anything Cloudflare injects at the edge arrives after those
  hashes exist. This is why the beacon is embedded by our own HTML rather than left to
  Automatic Setup: a `<script src>` (no hash needed) until 2026-10-08, and since then an
  inline loader that skips automated browsers, hashed like any inline script
  (`packages/shared/src/analyticsBeacon.ts`). A manual embed POSTs to
  `cloudflareinsights.com` while automatic setup posts to your own origin, so those
  two `connect-src` entries are not interchangeable. The policy is a pure function
  in `apps/viewer/scripts/csp.mjs` with tests; `apps/viewer/scripts/gen-headers.mjs`
  is only the I/O around it.

  🟢 **Qualify package paths.** A repo-root `scripts/` also exists, so a viewer script
  cited without its `apps/viewer/` prefix resolves to a real directory that does not
  contain it, and eyeballing never catches that. Same shape as the
  `--keep`-resolves-against-CWD and `eval:artwork:real -- raw/x.glb` traps in
  `tools/asset-pipeline/CLAUDE.md`. `apps/cms/src/claudeMd.test.ts` fails on a citation that resolves to nothing.

## Why a rule and not a nested CLAUDE.md

The headers/CSP/edge traps do not cleave along directory lines. `_headers` is
*generated* — it exists only at `apps/viewer/dist/_headers`, written by
`apps/viewer/scripts/gen-headers.mjs` — while the half that answers for it lives in
`apps/viewer/worker/securityHeaders.ts`. A nested CLAUDE.md keys on ONE directory,
so whichever directory it sat in, it would stay silent while you edited the other
half. A `paths:` glob is the only mechanism here that covers both, and it fires for a
rule present at session start (measured 2026-09-05; the record is in
`docs/CLAUDE-MD-MAINTENANCE.md`).

Like a nested CLAUDE.md, a rule is **not re-injected after `/compact`**. It reloads
only when a matching file is next read.
