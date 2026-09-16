# QA Checklist — RUN APPAREL 3D Product Viewer

Run through this list before announcing any new product, colourway or deployment.
Test on **iOS Safari, Android Chrome, desktop Chrome/Safari/Edge**, and once on a
throttled "Slow 4G" network profile.

## Direct URLs & QR flow

- [ ] `https://viewer.wear-run.help/<product>/<colour>` loads correctly on **first visit** (no client-routing gap)
- [ ] The same URL survives a **page refresh**
- [ ] Scanning the printed QR code opens the right product **and** pre-selects the right colourway
- [ ] Sloppy URLs normalise (`/RXPS/Wine` → `/rxps/wine`) — verified live 2026-08-17
- [ ] **Product-only URL** (`/rxps`, no colour) loads the default colour and tidies the address bar to `/rxps/wine` — *without* the "no longer active" notice, because nothing was retired. Verified live 2026-08-17: `requestedColourwayUnavailable: false`
- [ ] A **retired** slug still works: `/rxps/navy` loads Wine *with* the "no longer active" notice. `navy` is still the live example of this path after the 2026-08-15 rename — verified 2026-08-17: HTTP 200, `selectedColourway: wine`, `requestedColourwayUnavailable: true`. The five live colours are wine, blush, butter, lime, black
- [ ] **Clicking the wordmark** goes to the catalogue and does NOT land on "reference unavailable" (it linked to `/`, a dead route, until 2026-08-03)
- [ ] Unknown product URL shows the branded "reference unavailable" state with Back to Catalogue, Email Us, WhatsApp Us — and a `noindex` meta tag

## Stale-QR fallback

- [ ] URL for a **deactivated** colourway renders the default active colourway
- [ ] The inline notice ("The colourway linked by this QR is no longer active…") is visible and announced to screen readers
- [ ] The browser URL is silently replaced with the default colourway path (no redirect loop, back button still works)

## Both variant modes

- [ ] `single-glb-variants`: every colourway tab switches the live model via material variants — no re-download, no blank model
- [ ] If a variantId is missing from the GLB, the current model stays visible with a graceful notice (check with a deliberately broken test product)
- [ ] `separate-glb-per-colour`: each tab swap shows the new colourway's poster instantly, then its GLB loads; brief loading indicator only while genuinely loading
- [ ] Both modes feel equivalent to the visitor

## 3D stage

- [ ] Poster renders **immediately**; 3D loads in the background without a "View 3D" click
- [ ] Drag to rotate + scroll/pinch zoom work; guidance text visible
- [ ] FRONT / BACK / SIDE animate smoothly to the CMS-configured positions; free rotation still works afterwards
- [ ] No AR button anywhere
- [ ] With WebGL disabled (or `saveData` on), the static poster fallback appears and specs/tabs/contacts/catalogue all remain

## Colourway UX

- [ ] Tabs are numbered (01 NAVY, 02 BLACK, …) and the active tab is marked by more than colour alone
- [ ] Desktop: hover/focus shows the static preview; click changes the model
- [ ] Touch: first tap selects immediately (no hover dependency); tap targets ≥ 44px
- [ ] URL updates on every colourway change without a full reload

## Motion & interaction (refined layer)

- [ ] Preloader shows the blueprint counter + volt rule, then wipes up to reveal the stage (no long hold; caps ~2.5s even on slow data)
- [ ] Sections fade/rise in as you scroll (scroll-reveal); nothing stays stuck invisible
- [ ] Smooth-scroll feels natural; **scroll-to-zoom still works over the 3D model** (Lenis is prevented on the stage)
- [ ] Desktop fine-pointer: the precision crosshair cursor appears and expands over links/buttons/tabs; magnetic pull on controls; the native cursor is hidden only while active
- [ ] Theme toggle cross-fades (View Transitions) where supported; instant swap otherwise
- [ ] Switching colourway cross-fades the poster + colour label
- [ ] "How we build your product" expands/collapses smoothly (no instant jump); collapsed content is not keyboard-focusable
- [ ] **Reduced motion** (`prefers-reduced-motion: reduce`): no preloader animation, no smooth-scroll, no custom cursor, no reveals held hidden — the full page is immediately present and static
- [ ] Touch devices: no custom cursor; all interactions work by tap

## Accessibility

- [ ] Full keyboard pass: every control reachable, visible focus states, no traps
- [ ] Landmarks and heading hierarchy sensible in a screen reader
- [ ] Theme toggle, camera buttons, tabs and contact links all have accessible names
- [ ] Status/progress changes are announced (aria-live)
- [ ] `prefers-reduced-motion`: no non-essential animation anywhere
- [ ] All posters/fallback images have meaningful alt text

## Light / dark mode

- [ ] Follows system preference by default; manual toggle overrides; choice survives reload
- [ ] Light: volt blocks with ink text, ink primary buttons, ink headlines
- [ ] Dark: volt text labels, volt primary buttons, volt headlines, off-white body text, max one glow, subtle grain
- [ ] Contrast spot-check in both modes (especially muted text)

## Contact

- [ ] EMAIL US opens a draft to partner@wear-run.com with subject `Product Enquiry — <Product> / <Colour>` and the full template body
- [ ] WHATSAPP US opens wa.me/923361777313 with the same pre-filled text (desktop → WhatsApp Web, mobile → app)
- [ ] Microcopy telling the prospect to complete the open fields is visible
- [ ] Mobile bottom bar never covers the 3D controls; desktop rail appears only after scrolling past the stage

## Content rules

- [ ] No prices, stock, SKU, ratings, cart, checkout or retail language anywhere
- [ ] No certifications, sustainability claims, MOQs or lead times on the page

## Auto-shrink pipeline (raw uploads)

Only if the garment came through **Raw uploads** rather than the manual CLI recipe.
Full guide: [FIRST-GARMENT-UPLOAD.md](FIRST-GARMENT-UPLOAD.md).

- [ ] Raw upload reached **Ready to review** (not Failed, not stuck on Queued)
- [ ] The **Report** lists the colour variants, and they match the CMS colourway
      `variantId`s **exactly** — otherwise the colour buttons silently do nothing
- [ ] Result GLB is **under 40 MB** (the shrink Worker pre-checks this and says so
      in plain language if not — a bare HTTP 400 means something else went wrong)
- [ ] A deliberately bad upload (a `.txt` renamed `.glb`, or a filename containing
      `?`) is rejected with a **real message**, never "Something went wrong."
- [ ] `wrangler tail run-apparel-viewer-shrink` shows **no `Exceeded memory limit`**
- [ ] Container image is current: `wrangler containers list` → `LAST MODIFIED` is
      at or after the last commit touching `apps/shrink` or `tools/asset-pipeline`
- [ ] **The colour names came from the file, not from memory.** On the Colours tab
      each option in "Which colour in your CLO file is this?" shows a swatch and a
      suggested name. Check the swatch matches the row it sits under — on
      2026-08-03 the live site had a maroon variant under a row called "Navy", a
      blush one under "Black" and a powder blue one under "Crimson"
- [ ] **No colours in the file are unmapped.** If the banner above the list says
      "we found N colours … not on your website yet", either add them or decide
      deliberately not to. Two of N001's five were invisible to buyers for weeks
- [ ] If the job **failed on artwork** that is the gate working, not a crash —
      but the two messages need **different** responses, and this line told you to
      do the same thing for both until 2026-08-04:
      - *"printed artwork … was damaged while shrinking"* → decimation tore the
        UVs. **Re-upload at Highest quality.**
      - *"…came out see-through"* / *"the cut-out threshold … is wrong"* → an
        `alphaMode` fault, decided identically at every Detail level. **Detail
        will not help.** Since 2026-09-02 "see-through" refuses only a hard-edged,
        fully opaque print the pipeline failed to cut out — a pipeline fault, so
        tell your developer rather than re-exporting. A soft or deliberately
        translucent print no longer refuses: it is saved and listed in the report
        under "SOFT PRINTED ARTWORK KEPT SEE-THROUGH". See RAW-UPLOAD-PIPELINE.md →
        troubleshooting

## Performance & assets

### The reference numbers (so "is it fast?" stops being an opinion)

Measured against **live production**, N001 wine, warm connection, 2026-08-13.
These are what the shell checks cannot tell you: `lighthouserc.json` and
`scripts/check-bundle-budget.mjs` both measure the application *shell*, and the
shell is ~5% of what a buyer actually downloads.

✅ **The first three rows are now watched automatically** — `perf-watch.yml` runs
`scripts/perf-probe.mjs` weekly against these thresholds and fails the run on a
regression. Re-measured through it on 2026-08-13: viewer HTML **0.77 s**, product
API **3.11 s**, health **0.38 s**, all inside the table below. Two things it
deliberately does **not** do, both for reasons that are easy to get wrong: it never
GETs the model (27 MB against a $5/month R2 egress cap), and it therefore cannot
report the model's cache status — see the ⚠️ below. A 403 from a runner is reported
as *inconclusive* and keeps the run green.

| Thing | Measured | Treat as a problem if |
|---|---|---|
| Viewer HTML, time to first byte | **0.47 – 0.92 s** | consistently > 1.5 s |
| Product API (`/api/public/viewer/rxps/wine`) | **2.1 – 3.7 s** | > 5 s |
| The garment itself (27 MB GLB) | **~19 s at ~1.45 MB/s** | the *rate* drops, not the time — time scales with the tester's line |
| Model edge cache | **`cf-cache-status: HIT`**, age ~13.7 h | `MISS` on repeat requests |
| Bare apex (`https://wear-run.help/`) | **404 in 0.89 s** (2026-08-19) | a 5xx, or > 2 s |
| Old catalogue and profile addresses (`/catalogue`, `/profile`) | **410**, `text/html`, "no longer active" | a PDF, or anything but 410 |
| Private host without a code (`https://catalogue.wear-run.help/`) | **404**, `text/html`, `x-robots-tag: noindex, nofollow` | a 200, or a PDF |
| Private document page, with its code (decided 2026-09-15) | **200**, `text/html`, `cache-control: no-store` | `public, max-age=300`, or any cached `HIT` — the page must reach the Worker on every open, so every visit is counted |
| Marker pixel (`/<code>/seen/<n>`) | **200**, `image/gif`, `cache-control: no-store`, `cross-origin-resource-policy: same-origin` | any other status, or a cached `HIT` |
| Download stop (`/<code>/get`) | **302**, `location: download`, `cache-control: no-store` | a 200, or a cached `HIT` |

⚠️ **The apex figure replaced a 20.2 s one on 2026-08-19 (audit L6).** It used to
return **522 after 20.214 s** — Cloudflare timing out against an origin that was
never there. The 522 was BY DESIGN and owner-confirmed; the *duration* was the
finding, because a typo, an accidental link or a crawler hung for twenty seconds.
`infra/apex-404/index.js` now answers at the edge instead.

⚠️ **`/catalogue` IS NO LONGER A REDIRECT, and this paragraph said it was until
2026-08-30.** The claim was that a Single Redirect answered it first, so the Worker
was never reached. Both halves are now false: the PDFs moved from Google Drive into
the `run-assets` R2 bucket on 2026-08-28, and the apex Worker serves them itself —
a plain GET returns **200 with no `Location` at all**. `.github/workflows/uptime.yml`
had been asserting the redirect and erroring on every run since, while still
concluding `success`; `scripts/apex-probe.mjs` replaced that check.

⚠️ **Decided 2026-09-11, live from the merge that deploys it: neither address serves a
PDF at all.** The catalogue and profile open only from private links whose codes are
Worker secrets, and nothing in this checklist may hold one. Check the real links by
opening them from the owner's Passwords.

**Do not "simplify" this by deleting the apex DNS record** — it must stay proxied or
the site and the retired `/catalogue` and `/profile` addresses stop resolving. The
private links do not depend on it: they are custom domains with their own DNS records.

⚠️ **Read `cf-cache-status` from the GET, never from a `curl -I`.** Measured the
same minute: the GET said `HIT`, a HEAD on the identical URL said `DYNAMIC`. HEAD
does not share the GET's cache entry — the same divergence behind the cached-404
incident of 2026-08-06 (root `CLAUDE.md`). A HEAD reading here produces a
convincing but false "the model is never cached" conclusion.

⚠️ **The API is the slow one, and that is known and deliberate.** A Worker's own
response does not pass through the edge cache, so its `s-maxage` buys nothing.
This is why per-garment link previews are crawler-only — rewriting for every
visitor would put ~2 s in front of every QR scan. See `apps/viewer/CLAUDE.md`.

- [ ] Poster visible well before the model on Slow 4G
- [ ] GLB used is the **pipeline-processed** one (`pnpm pipeline validate --strict` passed, and "Colours checked" shows green — it is derived and read-only, not a box you tick)
- [ ] GLB is **under the size budget** (well under 8 MB; the CMS hard-blocks over 40 MB) — textures are **WebP or KTX2**, not raw PNG/JPEG
- [ ] Geometry was **simplified** for raw CLO exports (`--simplify`) — a raw cloth-sim mesh runs to millions of triangles; the mesh, not the textures, is the size cost
- [ ] Filename is **URL-safe** (letters, numbers, `. _ -` only — no spaces/brackets), or the CMS rejects the upload regardless of size
- [ ] Poster images are WebP/AVIF and reasonably sized
- [ ] Fallback image loads even when the GLB request is blocked

## 3D render correctness

- [ ] Model loads in a few seconds, not tens — no long spinner on the interactive view
- [ ] Fabric reads as **textured with depth**, not a flat grey shape (image-based lighting is applied via `environment-image`)
- [ ] Fabric is **solid, not see-through** (opaque + double-sided step applied; `pnpm pipeline validate` reports **0 translucent** materials — model-viewer has no OIT)
- [ ] Printed graphics, logos and decals render **in colour**, not as solid black patches
- [ ] **Zoom right in on a printed logo, on a phone.** Decimation trades artwork
      fidelity for file size, so this is the check that has actually failed before —
      logos tore apart at the settings shipped on 2026-07-27, and again on the
      first real garment on 2026-07-29. If they look smeared,
      re-upload with **Detail: Highest quality**
- [ ] **Zoom in again and check the logo is not see-through, and not sitting in a
      pale box.** This is a different failure with a different cause — the
      `alphaMode` chosen from the texture's alpha — and **no Detail level changes
      it**. On 2026-08-03 the live N001 chest wordmark rendered as a near-white box
      measured at (240,240,240); the mis-calibrated threshold behind it was fixed
      on 2026-08-04
- [ ] **Read the "Mesh decimation" line in the upload's report.** If more parts
      came back *without* artwork protection than with, the setting that protects
      printed graphics did not apply to this garment and changing the Detail level
      will not help. Tell your developer; see `docs/OPEN-ISSUE-ARTWORK.md`
- [ ] Before/after comparison, when artwork is in doubt: a developer can run
      `node tools/asset-pipeline/scripts/bisect-artwork.mjs <raw.glb>` on the original CLO export. It
      renders the garment and produces side-by-side contact sheets, so this stops
      being a judgement call made from memory on a phone screen
- [ ] Switching colourway tabs **swaps the model live** with no "temporarily unavailable" notice (variants bound correctly)
- [ ] Browser console shows **no `[viewer:*]` warnings** (`model-load-error`,
      `variant-missing`, `render3d-unavailable`, and — added 2026-07-31 —
      `viewer-load-failed`, `viewer-api-error`, `route-unparsed`, which used to
      fail silently into the "unavailable" screen with nothing logged)
- [ ] Browser console shows **no Content-Security-Policy violations**. Every
      production GLB is Meshopt-compressed and its decoder loads through a
      `blob:` URL; that was blocked until 2026-07-31 and only showed up here
