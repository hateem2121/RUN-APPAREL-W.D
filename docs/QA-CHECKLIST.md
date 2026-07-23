# QA Checklist — RUN APPAREL 3D Product Viewer

Run through this list before announcing any new product, colourway or deployment.
Test on **iOS Safari, Android Chrome, desktop Chrome/Safari/Edge**, and once on a
throttled "Slow 4G" network profile.

## Direct URLs & QR flow

- [ ] `https://viewer.wear-run.help/<product>/<colour>` loads correctly on **first visit** (no client-routing gap)
- [ ] The same URL survives a **page refresh**
- [ ] Scanning the printed QR code opens the right product **and** pre-selects the right colourway
- [ ] Sloppy URLs normalise (`/N001/Navy` → `/n001/navy`)
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

## Performance & assets

- [ ] Poster visible well before the model on Slow 4G
- [ ] GLB used is the **pipeline-processed** one (`pnpm pipeline validate --strict` passed, "Variants verified" ticked)
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
- [ ] Switching colourway tabs **swaps the model live** with no "temporarily unavailable" notice (variants bound correctly)
- [ ] Browser console shows **no `[viewer:*]` warnings** (`model-load-error`, `variant-missing`, `render3d-unavailable`)
