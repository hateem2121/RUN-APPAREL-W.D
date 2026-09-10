# CLAUDE.md — apps/viewer

Split out of the root `CLAUDE.md` on 2026-08-10 by `/doctor` (the root had reached 39,674
chars). These traps are reachable only by editing files under `apps/viewer/`, so they load
when they matter instead of in every session.

Root `CLAUDE.md` still holds the cross-cutting traps — read it first.

## Traps — each of these has already cost a session

- **model-viewer BAKES the draco and ktx2 decoder locations at MODULE-EVALUATION
  time, and there is NO equivalent line for meshopt — which is exactly why meshopt
  has always worked here and draco never has.** `lib/features/loading.js` runs, at
  import:

  ```js
  const ModelViewerElement = self.ModelViewerElement || {}
  const dracoDecoderLocation =
    ModelViewerElement.dracoDecoderLocation || DEFAULT_DRACO_DECODER_LOCATION
  CachingGLTFLoader.setDRACODecoderLocation(dracoDecoderLocation)
  ```

  So it reads a GLOBAL that must exist **before** the import; meshopt has no default
  and is set only by the post-import setter. `Stage.tsx` set all four the same way
  after the import, and the two that look identical behaved oppositely. Measured on
  a cold load of the live site 2026-08-21: `dracoDecoderLocation` =
  `https://www.gstatic.com/draco/versioned/decoders/1.5.6/`, `meshoptDecoderLocation`
  = `/meshopt_decoder.js`. **A draco garment therefore rendered nothing in
  production** — the CSP correctly refused gstatic — and fell back to its poster.
  `Stage.tsx` now seeds `self.ModelViewerElement` before the dynamic import, per
  model-viewer's own docs. ⚠️ **UNVERIFIED**: it could not be reproduced locally
  because a harness using the `dist` build registers its own global and behaves
  differently from the ESM `lib/` the app bundles (`dist` reads `undefined`, live
  reads gstatic). Production stays on `--meshopt`
  (`packages/shared/src/shrink.ts`); **before re-enabling `--draco`, load the
  deployed site cold and check
  `customElements.get('model-viewer').dracoDecoderLocation === '/draco/'`.**
  ⚠️ Three wrong diagnoses preceded the right one, all plausible, all disproved by
  measurement: "it is set on the instance not the class" (it is the class — the local
  is just named `element`), "model-viewer is duplicated across chunks" (only one
  chunk contains it), "the setter throws" (none of them do). **`git log` proves
  nothing here** — the old line was committed, deployed, error-free and inert.

- **THE BACKING MATERIAL IS THE FIRST OF A SET; A COLOURWAY SWITCH DRAWS ANOTHER
  (DV-01, fixed 2026-09-03).** Biasing entry one of `$correlatedObjects` reported 26/26
  while the live skinsuit drew 1 of 6 and the bib 0 of 5. `correlatedThreeMaterials()`
  writes every entry; `webgl.spec.ts` counts the SCENE's drawn cut-outs on all five tabs.
- **model-viewer BUILDS ONLY THE ARRIVING COLOURWAY'S MATERIALS, so anything done
  to `model.materials` on `load` reaches a fraction of them.** Measured on the live
  garment 2026-08-27: **200 materials, 44 built, 156 lazy**; of 26 printed cut-outs,
  **6 biased and 20 never**. Variant-only materials are constructed with an empty
  `Set` plus a `LazyLoader` (`lib/features/scene-graph/model.js`), and the backing
  getter returns `this[$correlatedObjects].values().next().value` — `undefined`. So
  the decal depth bias shipped, was committed, was deployed, and left four of five
  colourways flickering. **`variant-applied` fires after `await
  model[$switchVariant]()` resolves**, which is when the rest become reachable;
  `Stage.tsx` re-applies there. Verified in a browser: 11/11 biased on load, then
  16/16, 21/21, 26/26 as each colourway was visited.
  ⚠️ **`isLoaded` is PUBLIC and is what separates the two silences** — "this
  colourway is not open yet" (normal, quiet) from "the internal symbol is gone"
  (report it). The first version collapsed both into one counter that nothing read,
  which is how 156 misses stayed invisible.
  ⚠️ **The seeded fixture could not exhibit this** — its colourways built identical
  artwork materials, so `dedup()` merged them into one always-eager material: 6 MASK,
  6 eager, **0 lazy** against production's 26/6/20. `PlaceholderColourway.ink` now
  tints each colourway's print as a real CLO export does. A test here must assert the
  swap loaded NEW cut-outs before asserting they are biased, or an inadequate fixture
  passes it silently.

- **THE LAYOUT QUERY AND THE CONTENT QUERY ARE NOT THE SAME QUERY, and building
  them as one broke a landscape phone.** Found 2026-08-21, before shipping, by
  measurement rather than by review. `<ProductIdentity>` moves the product's name
  and description into `.stage__aside` on wide screens; keyed off
  `TWO_COLUMN_QUERY` alone, at **844x390 the band grew to 726px in a 390px
  viewport** — garment cut off at the fold, colourway rail and both enquiry buttons
  underneath it. The two-column query deliberately includes a landscape phone, so
  that the CONTROLS can sit beside the garment in a ~320px band; a 312-character
  paragraph is a different question and needs its own, narrower query.
  ⚠️ **The second attempt was worse, because it looked measured and was not.** A
  `min-height: 700px` floor extrapolated from ONE sample at 1024x768 broke 900x700
  (band 729px). The requirement is not width-independent: below a ~300px column the
  colourway rail's container query wraps five swatches onto two rows, costing 60px
  at exactly the width where the narrower column is already making the paragraph
  taller. Measured needs — 900px wide: 797px tall · 1024: 758 · 1100: **677** ·
  1280+: **664**. The floor is `(min-width: 1100px) and (min-height: 720px)`, and
  1024x768 is excluded on purpose: it fits by 10px, and a ten-pixel margin on a
  layout whose inputs are a CMS textarea and a font is a coincidence, not an
  invariant. `useIdentityInAside.ts` carries the table; `useIdentityInAside.test.tsx`
  pins the identity query as a strict subset of the CSS one, because outside that
  block `.product-info--aside` has no styles at all — a 69px viewport-sized heading
  in a 260px column.

- **`data-reveal` ON A COMPONENT THAT CHANGES PARENTS IS A PERMANENTLY INVISIBLE
  COMPONENT.** `startReveals()` (`polish/reveal.ts`) queries `[data-reveal]` ONCE,
  at startup, and observes what it finds; it has no MutationObserver. An element
  that React re-parents on a resize — which is exactly what `<ProductIdentity>`
  does when the viewport crosses `IDENTITY_IN_ASIDE_QUERY` — is a NEW element
  created after that scan, so it is never observed, never gets `.is-inview`, and
  stays at `opacity: 0` for the rest of the session. The page would simply lose its
  own product name and description after one window resize, with no error anywhere.
  The product panel therefore carries NO `data-reveal` in either position; the fix
  is removing the attribute, not making the observer smarter, because reveal is the
  wrong effect for the page's primary content anyway. `.customise` and `.contact`
  keep theirs — neither moves.

- **THE SOFT SHADOW COSTS NOTHING PER FRAME — do not "optimise" it.** Measured
  2026-08-21 at 1440x900, DPR 2, 4x CPU throttle, over 2.5s of continuous orbiting:
  `shadow-intensity 0.6 / softness 0.8` (shipped) **33.4ms** median frame,
  `shadow-intensity 0` **33.3ms**, `softness 0` **33.4ms**. Identical, zero long
  tasks in all three. `shadow-softness` reads like an obvious per-frame blur cost
  and is not one — model-viewer regenerates the shadow map when the light or model
  moves, not when the camera does. The 33.4ms floor is the GEOMETRY: 2,419,902
  triangles, of which **98.9% is decorative topstitch** (`Cloth_mesh` is 10,234).
  Turning the shadow off buys nothing and loses the grounding. The same run measured
  a colourway swap blocking the main thread for **121-131ms** on three of five
  swaps — one rebinding of 200 materials, not addressable from the viewer.

- **A STATIC IMPORT OF ONE 700-BYTE HELPER DRAGGED 287 KB OF THREE.JS ONTO THE
  CRITICAL PATH, and every deferral mechanism in the repo was powerless against
  it.** Found 2026-08-19. `__vitePreload` — Vite's own runtime function for
  loading a dynamic chunk — had been placed by rolldown *inside* the
  **model-viewer** chunk. The entry and the polish layer each imported that one
  function from there, and a static ES import of ANY symbol forces the browser to
  fetch and evaluate the WHOLE chunk. So the entry could not execute until
  1,024,060 bytes (**286,496 gzip**) had arrived, and the live waterfall showed
  `model-viewer-*.js` requested in the same burst as `index-*.js`.
  This defeated three separate deliberate mechanisms at once: `Stage.tsx`'s
  `await import('@google/model-viewer')`, `canRender3D()`'s refusal to run 3D
  under `saveData`, and the `modulePreload` filter in `vite.config.ts` — the last
  of which removes a `<link rel=modulepreload>` HINT and was never what fetched
  this. Fixed with a `preload-helper` group at `priority: 200` in
  `advancedChunks`. **Total bytes on disk did not change**, so
  `check-bundle-budget.mjs` cannot see this either way; the only signal is the
  entry chunk's own import statements. Pinned, with a verified negative control,
  by `e2e/motion-and-layout.spec.ts` -> "the 3D renderer is not a static
  dependency of the entry chunk".

- **`manualChunks` does not govern rolldown's CommonJS wrapper modules; use
  `advancedChunks`.** Instrumented 2026-08-19, `manualChunks` returned `'react'`
  for `react/jsx-runtime.js` and `react/cjs/react-jsx-runtime.production.js`
  correctly — and rolldown duplicated them into the motion chunk anyway
  (`react.transitional.element` greps in BOTH chunks of one build), so the entry
  bound to the copy and every phone fetched 48 KB gzip of Motion for a cursor
  that never mounts on touch. Four `manualChunks` repairs failed, one made it
  worse (Motion folded into the react chunk, 181 -> 310 KB). Swapping the whole
  block to rolldown's native `advancedChunks` fixed it outright. Details and all
  four dead ends are in `vite.config.ts`.

- **A desktop browser at a phone's width MEASURES THE STAGE WRONG, because it has
  no URL bar.** `.stage__canvas`'s binding term was `calc(100dvh - Npx)`, and `dvh`
  excludes the browser chrome that is currently showing. Measured 2026-08-19 in the
  iOS 26.5 simulator on a real iPhone 17: `100svh` **714**, `100lvh` **754**,
  `100dvh` **714 ↔ 754** — and **one swipe produced 14 separate dvh changes**. So the
  canvas was **328px** on the device, not the 426px a desktop browser at 375x812
  reports, and it resized up to 14 times per swipe. Each resize makes model-viewer
  run `threeRenderer.setSize()` — a WebGL drawing-buffer reallocation — mid-scroll,
  on the phone already holding a 27 MB model. That is what the owner reported as
  "the mobile version feels laggy". It is `svh` since then. **Measure phone layout
  in the simulator, or accept that your number is the best case.**

- **`[data-reveal]` makes every live-page layout measurement 24px wrong until the
  reveal has run.** `.colourways` sits under `transform: translateY(24px)` while
  un-revealed, with a computed `margin-top` of **0** — so the offset presents as a
  24px gap "from nowhere" between two elements that have no margin between them.
  Sweeping candidate stage heights on the live site this way produced a subtrahend
  that then FAILED e2e on all three engines with 4-6px of clearance. **Tune layout
  against `test:e2e`, not against an injected style on the live page** — it measures
  Chromium, WebKit, Firefox and mobile Safari at once.

  ⚠️ **THE SECOND HALF OF THIS PARAGRAPH WAS FALSE UNTIL 2026-08-20, AND IT IS THE
  REASON THE SUITE WAS TRUSTED.** It said Playwright "sets `reducedMotion: 'reduce'`
  … so there is no transform to pollute it". `playwright.config.ts` does set it, and
  it never reached the page. Measured on Playwright 1.62.1, all four engines:

  ```
  info.project.use.reducedMotion        "reduce"   <- the config resolved it
  matchMedia('…reduce').matches         false      <- the page never saw it
  after page.emulateMedia() explicitly  true       <- the API itself works
  ```

  So every `.colourways` measurement this suite ever took carried the reveal's own
  `matrix(1, 0, 0, 1, 0, 24)`, and the number depended on WHEN the assertion ran
  inside an 800ms transition — caught mid-flight in one run, Firefox reported
  6.03px of translate where WebKit reported 24px. **Layout assertions were racing an
  animation**, which is the same defect the live-page sweep above was condemned for,
  in the tool recommended as the cure.

  `motion-and-layout.spec.ts` now calls `page.emulateMedia({ reducedMotion: 'reduce' })`
  in a `beforeEach`, which demonstrably works. If you add a layout spec elsewhere, do
  the same — **do not assume the config option applies.** Verify with
  `matchMedia('(prefers-reduced-motion: reduce)').matches` before trusting a number.

- **model-viewer treats a 2px tap as a COMMAND, and the miss branch zooms right
  out.** `disable-tap` is set since 2026-08-19; the reasoning, including why
  `disable-pan` is deliberately NOT used, is on `DISABLE_TAP` in `Stage.tsx`.

- **The stage band's height budget has been wrong THREE TIMES, always by
  reasoning instead of measuring.** `.stage__canvas`'s third term
  (`calc(100dvh - Npx)`) is the chrome around the garment. On 2026-08-17 it went
  208 → 280 (adding up: 225px measured chrome + a 54px control row) → **overflowed
  by 36px** the moment a caption row existed, because a 15px display-face line is
  37px of layout, not the 25px it looks like → 316 → **wasted 35px** once the
  caption and the controls shared one row → 282, which is what
  `getBoundingClientRect()` reports. Read the number off the live band; every
  estimate in that comment's history has been wrong.

- **A `focus()` call is a scroll call.** `App.tsx` hands focus to `<main>` when
  the preloader leaves — correct, and it silently scrolled every visit down by
  exactly the header's height (measured `scrollY: 69` on desktop, `117` where the
  header wraps). `<main>` starts under the sticky header and is taller than the
  viewport, so the browser scrolls the minimum that makes it fill the viewport.
  At 390x844 the header then covered the top **29px of the garment**, which was
  reported as "the model gets cut off" and diagnosed as a stage-height problem.
  `focus({ preventScroll: true })`. There is no `scrollTo` anywhere in this app;
  if the page is not at the top, this is the first thing to check.
  ⚠️ **An e2e test for it is flaky in the direction that PASSES** unless it waits
  for the hand-off — assert straight after the `<h1>` appears and the focus effect
  has usually not committed yet, so it measures `scrollY: 0` against unfixed code.

- **model-viewer 4.x DELETED `--poster-color` and `--progress-mask`, and CSS says
  nothing when you set a property nobody reads.** `page.css` used both to
  suppress the built-in loading poster; verified against the installed 4.3.1,
  `lib/template.js` contains only `--progress-bar-color` and `#default-poster`
  hardcodes `background-color: #fff0` with the `poster` attribute painted into its
  `background-image`. So the snapshot went on showing for an entire major version
  while the source read as though it were off. The fix is to stop passing
  `poster` at all. Assert the PROPERTY in a test, never the attribute — React
  sets these as properties and never reflects them, so `getAttribute('poster')`
  is null either way and passes vacuously.

- **`touch-action="pan-y"` gives the browser every gesture with a vertical
  component, before model-viewer sees one event.** No threshold, no heuristic —
  the browser claims the touch on the first move. On a phone that means any drag
  meant to turn the garment scrolls the page instead, which is what the owner
  reported on 2026-08-17. It is `none` since then, and that is only safe because
  the canvas is 464 of 844px and the stage band ends above the fold, so there is
  more non-canvas height on screen than canvas. **If the canvas is ever made tall
  enough to fill a phone screen, put `pan-y` back** — otherwise the visitor is
  trapped on the model with no way to scroll past it.

- **`flex-shrink: 0` does not stop a flex CHILD wrapping to a new ROW — it is
  what causes it.** The header was 117px tall on a 375px phone (14% of the
  viewport, above the garment) because its children needed 351px of 343px and
  therefore wrapped, while `page.css`'s own comment recorded the height as
  "69px to 81px". That comment was about a different bug: the label wrapping to
  two LINE-BOXES inside the button, which `flex-shrink: 0` did fix. Two bugs, one
  symptom, one stale number. 10px of column-gap and a 16px wordmark bought 30px
  and took it back to 69px at 360 and 375.

- **`.contact-rail` and `.action-bar` breakpoints must stay EQUAL.** They were
  1100px and 900px, so between 900 and 1099px the page carried no persistent
  contact control at all — on the only conversion path in the product. Nothing
  reported it because the e2e matrix runs 320/375/768/1280 and both 768 and 1280
  sit on working sides of the gap. Verified in a browser at 950px: zero controls
  with the old rule, two with the new one. There is now a test at 950.

- **model-viewer's CAMERA reads the ATTRIBUTE, and setting the property silently did
  nothing.** Measured 2026-08-27 while framing a decal: `mv.cameraOrbit = '68deg 90deg
  auto'` followed by `jumpCameraToGoal()` left `getCameraOrbit()` at the old value, so
  a "grazing angle" comparison was really two head-on frames. It is a lit element —
  `setAttribute('camera-orbit', …)`, then **`await mv.updateComplete`**, then
  `jumpCameraToGoal()`. The reverse of the `src` trap below, which is why both are
  here: **verify a camera move by reading `getCameraOrbit()` back** before trusting
  any frame it produced.

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

- **`Stage.tsx` shadows the global `performance`, and `performance.now()` inside it
  would throw at runtime with every unit test green.** Found 2026-08-13 while adding
  byte-accurate load progress. The component declared
  `const performance = product.performanceFeatures.join(' / ')`, which shadows the
  global for the WHOLE function body — including effects declared above it, because
  they close over the same scope. `performance.now()` there calls `.now()` on a
  string: `TypeError`, at runtime, in the browser only. Nothing in the unit suite
  touches the clock, so it stayed green; it was caught by biome's
  `useExhaustiveDependencies` reporting a missing dependency on `performance.now`,
  which is a lint rule finding a runtime bug by accident. The local is now
  `performanceSummary`. **If you need a timestamp in a component, check what names
  the component already binds** — `performance`, `history`, `location`, `name`,
  `status` and `screen` are all globals that read naturally as local variable names.

- **`translate` / `scale` / `transform` compose in a FIXED ORDER, and that half of
  the lesson cost a second bug.** `base.css` has warned since 2026-08-14 that the
  three are independent properties which cannot overwrite each other — true, and
  the fix for the magnet silently killing `.btn--primary:hover`'s lift. What it did
  not say is that the browser always applies them **translate → rotate → scale →
  transform**, and you do not get to choose. `transform` is applied INNERMOST, so
  anything scaling above it scales that transform's translation too.
  `.cursor-ring[data-pointer="true"]` set `scale: 1.53` while Motion wrote the
  ring's POSITION into `transform`. Measured 2026-08-15 with the pointer at
  (800, 400): the ring's centre landed at **(1224, 612)** — 1.53× the coordinates.
  So the custom cursor flew off-target the instant it crossed any button, link or
  colourway tab (`data-pointer` is exactly the over-a-control state) and sprang
  back on leaving. **The error is proportional to position**, so it is nearly
  invisible near the top-left of the screen and extreme near the bottom-right,
  which is why it was reported as intermittent rather than as a constant offset.
  Introduced by `c133949`, which replaced the original `width`/`height` inflation
  with `scale` — a sound instinct (animating width/height on the most
  frequently-updated element on the page is layout + paint + composite) that
  changed the *matrix* while only meaning to change the *size*. Fixed by passing
  `scale` through Motion so it lands in the SAME transform string as `x`/`y`:
  Motion's `transformPropOrder` lists x and y before scale, emitting
  `translateX(…) translateY(…) scale(…)`, which scales about the element's own
  centre and then moves it. **A paint-only change on that element is safe in CSS; a
  transform change is not.** Reverting to `width`/`height` also measures correct if
  the perf cost is ever preferred. Nothing caught it: no test renders the cursor,
  and `Cursor.tsx` refuses to mount under automation by design, so a browser agent
  sees a normal pointer. Verify this one by mounting the component with
  `navigator.webdriver` spoofed and reading the computed matrix.

- **A grid item's `min-height: auto` silently beats `max-height: 100%`.** The
  loading poster overflowed its stage by 926px for months this way — measured
  498×1500 inside 546×574 — and looked like the image was *tiling*, because the
  overflow was clipped by the sections above and below. `max-width` alone still
  left it at 623px. `min-height: 0` is the line that actually fixes it. Same trap
  as the familiar `min-width: 0` on flex children.

- **The inline-script CSP violation is Cloudflare PRECURSOR, and it is NOT fixed.**
  Called Web Analytics (wrong), then JavaScript Detections and "RESOLVED 2026-08-06"
  (also wrong — `enable_js:false` is Precursor's FINGERPRINT; Cloudflare disables JSD
  when Precursor is on). Root-caused 2026-09-04, live as Sentry VIEWER-8, **archived not
  resolved** because it still fires. No hash can cover it (per-request ray id) and
  nonces are impossible from a static `_headers`; never widen to `'unsafe-inline'`.
  ⚠️ **Only `sec-fetch-mode: navigate` reproduces it — plain `curl` reports it fixed.**
  Nothing visitor-facing is broken. `docs/VIEWER-CSP-BOT-FIGHT-MODE.md`.

- **A reserve adding `env(safe-area-inset-bottom)` counts the notch TWICE**
  (`.action-bar`'s height already holds it — ~34px dead on every iPhone page, reading as
  generous spacing), **and a layout assertion that scrolls first measures the scroll**:
  a 203px shortfall read as "the footer is 202px under the bar", and three scroll loops
  all lose that race. Measure reachability in DOCUMENT space,
  `el.bottom + scrollY <= docH - barH`.

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

- **`_headers` is applied by the STATIC ASSET HANDLER, so it survives
  `env.ASSETS.fetch()` and NEVER reaches a response the Worker builds itself.** Both
  halves measured on the live edge 2026-08-12, same route:
  ```
  200 asset-served:  csp, hsts, permissions-policy, referrer-policy, nosniff  ALL PRESENT
  400 Worker-built:  ALL FIVE ABSENT
  ```
  That is why `worker/securityHeaders.ts` is KEPT with no caller left — the Worker
  currently builds no response of its own, and the next one that carries HTML must
  not re-learn this in production. `apps/viewer/scripts/csp.test.ts` pins its values
  against `buildHeadersFile()`'s `/*` rule so the two copies cannot drift, and fails
  if a SIXTH header is added to `_headers` and not to it.
  ⚠️ **Two things made that measurement trustworthy, and both are easy to omit.** The
  probe header carried a deliberately NON-DEFAULT value (a default-shaped one proves
  nothing — see the `_headers` combining trap above), and a `/__worker-marker` route
  returning `X-Worker-Ran: yes` proved the Worker was in the path at all; without it
  the result is indistinguishable from the Worker never running.
  ⚠️ **The e2e fixture could never have caught the Worker-built half, because the
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
  hashes exist. This is why the beacon is embedded as a `<script src>` (no hash
  needed) rather than left to Automatic Setup. A manual embed POSTs to
  `cloudflareinsights.com` while automatic setup posts to your own origin, so those
  two `connect-src` entries are not interchangeable. The policy is a pure function
  in `apps/viewer/scripts/csp.mjs` with tests; `apps/viewer/scripts/gen-headers.mjs`
  is only the I/O around it.

  ⚠️ Those three were written without their `apps/viewer/` prefix until 2026-08-12,
  and a repo-root `scripts/` **also exists** — so each cited path resolved to a real
  directory that does not contain them, which is why eyeballing it never caught it.
  Same shape as the `--keep`-resolves-against-CWD and `eval:artwork:real -- raw/x.glb`
  traps in the root file: a relative path is only unambiguous next to a statement of
  what it is relative to. Qualify package paths; `apps/cms/src/claudeMd.test.ts`
  now fails on a citation that resolves to nothing.

- **The e2e fixture serves FOUR colourways; production serves FIVE**, and one tab
  is the difference between a clean row and a stranded remainder. Measured
  2026-08-20: a 68px grid floor gave one row of four against the fixture and
  **4 + 1** against the real five — a lone tab beside three empty cells, which
  overflows nothing, covers nothing, passes every clearance assertion and looks
  broken. Append a fifth before measuring, as `apps/viewer/e2e/motion-and-layout.spec.ts`
  -> "never strands a single swatch on its own row" does. This is the root file's
  fixtures-cannot-exhibit-the-failure rule in the one place it is cheapest to
  forget: the fixture renders a plausible rail either way.

- **The compact colourway styling is a `@container` query, not a media query — do
  not convert it back.** It asked `max-width: 767px` until 2026-08-20, which
  predicted the rail's own width only while the rail spanned the page. The moment
  it moved into the two-column layout's 260px aside, an 844px-wide screen took the
  DESKTOP pill treatment — pills needing 606px — inside a 217px box and stacked
  into FOUR rows: the aside grew to 396px inside a 321px band and pushed the
  contact buttons to y=448 on a 390px screen. `.colourways` carries
  `container-type: inline-size` — **never `size`**, which would make the block axis
  a containment root too, and this element is a flex item inside a band whose whole
  job is dividing height.

- **Removing an element breaks the WORDS describing it and the TESTS keyed on it.**
  The stage stopped painting a poster 2026-08-21. `LOAD_NOTICE` and `aria-label` both
  still claimed a photograph — through every gate, because the e2e asserting that
  sentence checked `.stage img` one line ABOVE and died there. **Negative assertion
  before the copy assertion.** Separately 15 tests keyed "stage in fallback?" on
  `.stage__poster-fallback` / `.stage img`; 9 were Firefox — which HAS WebGL
  here and NOT on a runner, so **that branch is CI-only**. Now
  `.stage__error:not([hidden])` — `:not` is load-bearing, that `<p>` is always
    mounted so its live region can announce. **Key a test on what the VISITOR gets.**
  Since 2026-09-03 (fix plan Rank 6) the stage paints the colourway's photo DURING THE
  DOWNLOAD only — `.stage__placeholder`, blurred, cross-fading into the 3D — and every
  failure state still shows no image, so the words above stay true.

- **A rendering fix here must be ported to `tools/asset-pipeline/src/review-server.ts`,
  or the owner judges a good garment as broken.** Three times now: the decal bias
  (2026-08-27, cost a day), then the adaptive near plane AND production lighting (both
  2026-08-29, reported as "sparkle" and "metallic/shiny feel" on files measured to have
  `metallicFactor` 0 on every material). Drift tests pin the shared CONSTANTS; they
  cannot see a whole new mechanism, which is exactly how the near plane slipped.

## Found 2026-08-28 — two defects in one lever, four lying instruments

**The decal bias shipped EIGHT TIMES TOO WEAK and every test stayed green.** `-1/-1`
left p001's print eaten through WITH the bias on; `-8/-8` closes it. n001 — tightest
cloth, and LIVE — is **0.000%** changed at `-8` and `-64`.

⚠️ **AND IT DID NOT FIX THE OWNER'S DEFECT — the NEAR PLANE did, 2026-08-29.**
model-viewer pins `camera.near` at 0.00436 m and the depth step grows with **z²**, so
zooming OUT cut the margin over CLO's 0.100 mm print offset to **1.5×** (5.1× in —
"perfect zoomed in, blinks out"). `camera-near-plane.ts` fixes it, as a property
OVERRIDE since model-viewer rewrites `near` every camera change. KEEP the pipeline
`depthBias` path: p001 at 0.001 mm still lands ~4×. Logos never fought — BLEND never
writes depth.

## Whose animation advice wins

**`docs/DESIGN.md` outranks the three vendored motion skills** (`review-animations`,
`emil-design-eng`, `motion`). It is the viewer's *locked* design system, and
`packages/ui/src/tokens.css:2` cites it as their authority.

Not a precaution, arithmetic: `review-animations` standard 4 is *"sub-300ms on UI, or
it is a finding"* while `docs/DESIGN.md` §5 locks `--settle` at **500ms** and `--slow`
at **800ms**, so an agent applying that skill files two findings against the locked
system. The three agree on mechanics — **expect the collision on duration and easing,
not technique.** Full rulings in `.claude/skills/README.md`.

## No Tailwind here, and the skills will suggest it anyway

**No Tailwind, no shadcn/ui, no component library. Do not add one.** Appearance is
hand-written in `packages/ui/src/tokens.css`; behaviour, when a screen ever
needs it, comes from `base-ui`, which ships no CSS. Reasoning and reject list:
`docs/DECISION-UI-LIBRARIES.md`.

Several vendored design skills default to a Tailwind/shadcn idiom. Measured
2026-08-15: this repo has **zero** matches for `tailwindcss`, `@tailwind`,
`components.json` or `@radix-ui`, so such a suggestion compiles to nothing and
silently ships an unstyled element. **The tell is a `className` carrying utility
strings**; the fix is a semantic token, per `docs/DESIGN.md` §8.

## Running what these traps describe

```bash
npx --yes pnpm@10.34.5 --filter @run-apparel/viewer test:e2e
```

The e2e suite is the only thing that exercises `<model-viewer>` for real — under jsdom
it asserts against a stub, which is why this package's coverage floor is the repo's
lowest at 42% and why the floor must not be "fixed" by excluding `App.tsx`/`Stage.tsx`.
If it dies with `Timed out waiting 120000ms from config.webServer`, run
`env | grep -E 'NODE_ENV|PORT'` and confirm `pnpm` resolved (bare `pnpm` exits 127
inside the child process) **before reading any code** — both have caused that exact
timeout here.

**A THIRD cause of that same timeout: a stray fixture server.** `e2e/serve.mjs`
started by hand to drive the simulator holds 4173, so Playwright's own `webServer`
cannot bind and the suite reads as a code failure. `pkill -f e2e/serve.mjs` first.

**`--grep` does NOT survive the pnpm passthrough.**
`pnpm --filter @run-apparel/viewer test:e2e -- --grep "x"` runs the WHOLE suite and
silently ignores the filter — measured 2026-08-20, 252 tests where 20 were asked for.
Run `npx playwright test --grep "x"` from `apps/viewer/` instead (~2 s against ~40 s).

**Driving `e2e/serve.mjs` by hand needs `PORT=4173` explicitly.** `playwright.config.ts`
owns the port for the suite, and that fix does not reach a server you start yourself —
it still reads `process.env.PORT`, so under `PORT=5002` it binds there and `localhost:4173`
returns nothing.

**Driving the built app by hand needs `VITE_API_BASE_URL=''`.** A plain
`pnpm build` bakes in the production API, so `localhost:4173/n001/wine` renders
"REFERENCE UNAVAILABLE" — `n001` 404s in production (the live slug is `rxps`).
`e2e/prepare.mjs` sets it; anything driven by hand must too.

## Measuring on a phone: what each tool cannot see

- **The Browser pane cannot measure anything time-based.** It reports
  `document.visibilityState === "hidden"`, so rAF is throttled and CSS transitions
  freeze part-way — a paused `[data-reveal]` fade was reported as a stuck-opacity
  bug on 2026-08-19 before the check. `getBoundingClientRect()` is unaffected, so
  layout numbers from it are sound; frame rates are not obtainable at all.
- **Synthetic `PointerEvent`s do nothing to model-viewer.** A scripted pinch on the
  live page produced **0** `camera-change` events and moved neither camera nor FOV,
  and the resulting "0 m drift" was meaningless. Assert the control *responded*
  before believing any gesture measurement. Real touch comes only from the iOS
  simulator — `tap` / `swipe` / `touch_path` / `touch2_path`.
- **iOS 26.5 is the only runtime installed, and it is the floor of what is
  testable.** Probed 2026-08-19 on Xcode 26.6: iOS 15.5 is not downloadable, 16.4
  is (6.18 GB) — and 16.4's Safari already supports `svh`, so **no pre-15.4 browser
  is reachable on this machine.** `page.css`'s `@supports` fallback is unverifiable
  here by construction; say so rather than implying it was tested.
- **Biome rejects the duplicate-property CSS fallback idiom**
  (`lint/suspicious/noDuplicateProperties`). That is why `page.css` uses
  `@supports (height: 1svh)` blocks instead of two `height:` declarations — do not
  "simplify" them back.

- **A gitignored `apps/viewer/.env.local` fails the suite LOCALLY while CI stays
  green.** Found 2026-08-25: it sets `VITE_API_BASE_URL=http://localhost:3000`, and
  Vite loads `.env.local` in test mode too, so `src/lib/telemetry.test.ts` asserts
  the production endpoint and receives localhost. CI has no such file, so this is
  invisible there. The third instance of the environment-shadowing class the root
  file documents for `NODE_ENV` and `PORT` — and it cost a stash-to-baseline bisect
  to rule out as a code fault. Move it aside to test what CI tests; do not delete
  it, it is the local dev pointer.

