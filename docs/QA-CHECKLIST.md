# QA Checklist — RUN APPAREL 3D Product Viewer

Run through this list before announcing any new product, colourway or deployment.
Test on **iOS Safari, Android Chrome, desktop Chrome/Safari/Edge**, and once on a
throttled "Slow 4G" network profile.

## Direct URLs & QR flow

- [ ] `https://viewer.wear-run.help/<product>/<colour>` loads correctly on **first visit** (no client-routing gap)
- [ ] The same URL survives a **page refresh**
- [ ] Scanning the printed QR code opens the right product **and** pre-selects the right colourway
- [ ] Sloppy URLs normalise (`/N001/Wine` → `/n001/wine`)
- [ ] **Product-only URL** (`/n001`, no colour) loads the default colour and tidies the address bar to `/n001/wine` — *without* the "no longer active" notice, because nothing was retired
- [ ] A **retired** slug still works: `/n001/navy` loads Wine *with* the "no longer active" notice (`navy` was retired 2026-08-05 and is the live example of this path)
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
        will not help.** Re-export the graphic on its own opaque piece in CLO, or
        tell your developer. See RAW-UPLOAD-PIPELINE.md → troubleshooting

## Performance & assets

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
