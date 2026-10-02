---
paths:
  - "apps/viewer/src/styles/**"
  - "apps/viewer/src/components/**"
  - "apps/viewer/src/App.tsx"
  - "apps/viewer/src/polish/**"
  - "apps/viewer/e2e/**"
  - "packages/ui/src/**"
---

# The viewer's layout, motion and the tests that measure them

Moved from `apps/viewer/CLAUDE.md` on 2026-09-26, word for word, so these load only when you
open the files they govern (`docs/CLAUDE-MD-MAINTENANCE.md` explains the mechanism).

## Traps

- **🟡 THE LAYOUT QUERY AND THE CONTENT QUERY ARE NOT THE SAME QUERY, and building
  them as one broke a landscape phone.** Found 2026-08-21, before shipping, by
  measurement rather than by review. `<ProductIdentity>` moves the product's name
  and description into `.stage__aside` on wide screens; keyed off
  `TWO_COLUMN_QUERY` alone, at **844x390 the band grew to 726px in a 390px
  viewport** — garment cut off at the fold, colourway rail and both enquiry buttons
  underneath it. The two-column query deliberately includes a landscape phone, so
  that the CONTROLS can sit beside the garment in a ~320px band; a 312-character
  paragraph is a different question and needs its own, narrower query.
  🟡 **The second attempt was worse, because it looked measured and was not.** A
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

- **🟢 `data-reveal` ON A COMPONENT THAT CHANGES PARENTS IS A PERMANENTLY INVISIBLE
  COMPONENT.** `startReveals()` (`polish/reveal.ts`) queries `[data-reveal]` ONCE,
  at startup, and observes what it finds; it has no MutationObserver. An element
  that React re-parents on a resize — which is exactly what `<ProductIdentity>`
  does when the viewport crosses `IDENTITY_IN_ASIDE_QUERY` — is a NEW element
  created after that scan, so it is never observed, never gets `.is-inview`, and
  stays at `opacity: 0` (`packages/ui/src/base.css`) for the rest of the
  session. The page would simply lose its
  own product name and description after one window resize, with no error anywhere.
  The product panel therefore carries NO `data-reveal` in either position; the fix
  is removing the attribute, not making the observer smarter, because reveal is the
  wrong effect for the page's primary content anyway. `.customise` and `.contact`
  keep theirs — neither moves.

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
  reveal has run.** `.colourways` is moved down by `--reveal-y: 24px`
  (`packages/ui/src/tokens.css`) while un-revealed, with a computed `margin-top` of **0** — so the offset presents as a
  24px gap "from nowhere" between two elements that have no margin between them.
  Sweeping candidate stage heights on the live site this way produced a subtrahend
  that then FAILED e2e on all three engines with 4-6px of clearance. **Tune layout
  against `test:e2e`, not against an injected style on the live page** — it measures
  Chromium, WebKit, Firefox and mobile Safari at once.

  🟡 **UNTIL PLAYWRIGHT 1.63, `reducedMotion: 'reduce'` IN `playwright.config.ts` NEVER
  REACHED THE PAGE** (1.63 applies it; a test needing motion must `emulateMedia` it — CR-05), so
  the suite was trusted while the reveal's transform sat in every layout number.
  Measured on Playwright 1.62.1, all four engines:

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

  🟡 `motion-and-layout.spec.ts` now calls `page.emulateMedia({ reducedMotion: 'reduce' })`
  in a `beforeEach`, which demonstrably works. If you add a layout spec elsewhere, do
  the same — **do not assume the config option applies.** Verify with
  `matchMedia('(prefers-reduced-motion: reduce)').matches` before trusting a number.

- **🟡 The stage band's height budget has been wrong THREE TIMES, always by
  reasoning instead of measuring.** `.stage__canvas`'s third term
  (`calc(100dvh - Npx)`) is the chrome around the garment. On 2026-08-17 it went
  208 → 280 (adding up: 225px measured chrome + a 54px control row) → **overflowed
  by 36px** the moment a caption row existed, because a 15px display-face line is
  37px of layout, not the 25px it looks like → 316 → **wasted 35px** once the
  caption and the controls shared one row → 282, which is what
  `getBoundingClientRect()` reports. Read the number off the live band; every
  estimate in that comment's history has been wrong.

- **🟡 A `focus()` call is a scroll call.** `App.tsx` hands focus to `<main>` when
  the preloader leaves — correct, and it silently scrolled every visit down by
  exactly the header's height (measured `scrollY: 69` on desktop, `117` where the
  header wraps). `<main>` starts under the sticky header and is taller than the
  viewport, so the browser scrolls the minimum that makes it fill the viewport.
  At 390x844 the header then covered the top **29px of the garment**, which was
  reported as "the model gets cut off" and diagnosed as a stage-height problem.
  `focus({ preventScroll: true })`. There is no `scrollTo` anywhere in this app;
  if the page is not at the top, this is the first thing to check.
  🟡 **An e2e test for it is flaky in the direction that PASSES** unless it waits
  for the hand-off — assert straight after the `<h1>` appears and the focus effect
  has usually not committed yet, so it measures `scrollY: 0` against unfixed code.

- **🟡 model-viewer 4.x DELETED `--poster-color` and `--progress-mask`, and CSS says
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

- **🟢 `translate` / `scale` / `transform` compose in a FIXED ORDER, and that half of
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

- **A reserve adding `env(safe-area-inset-bottom)` counts the notch TWICE**
  (`.action-bar`'s height already holds it — ~34px dead on every iPhone page, reading as
  generous spacing), **and a layout assertion that scrolls first measures the scroll**:
  a 203px shortfall read as "the footer is 202px under the bar", and three scroll loops
  all lose that race. Measure reachability in DOCUMENT space,
  `el.bottom + scrollY <= docH - barH`.

- **The e2e fixture must serve the SAME colourway count production ships — it
  serves FIVE today (since 2026-08-30)**, and one tab is the difference between a
  clean row and a stranded remainder. Measured 2026-08-20, while the fixture still
  served four: a 68px grid floor gave one row of four against the fixture and
  🟡 **4 + 1** against the real five — a lone tab beside three empty cells, which
  overflows nothing, covers nothing, passes every clearance assertion and looks
  broken. The fixture was fixed on 2026-08-30 and the workaround deleted with it:
  `apps/viewer/e2e/motion-and-layout.spec.ts` -> "never strands a single swatch on
  its own row" used to append a fifth swatch itself and no longer does. Do not
  re-add appends, and re-count the parity whenever production gains or loses a
  colourway. This is the root file's fixtures-cannot-exhibit-the-failure rule in
  the one place it is cheapest to forget — and it bit again on 2026-09-04, when
  five single-word labels hid a two-word wrap defect the same test could not see.

- **🟡 The colourway rail's width rule is a `@container` query, not a media query — do
  not convert it back.** The rail asked the SCREEN's width (767px) until 2026-08-20,
  which predicted the rail's own width only while the rail spanned the page. The moment
  it moved into the two-column layout's 260px aside, an 844px-wide screen took the
  DESKTOP pill treatment — pills needing 606px — inside a 217px box and stacked
  into FOUR rows: the aside grew to 396px inside a 321px band and pushed the
  contact buttons to y=448 on a 390px screen. Since VA-32 (2026-10-02) the colours are
  44px dots at every width, and the one width query left lays a side column narrower
  than five dots (252px) out 3 + 2 rather than 4 + 1. The tall-column LIST is a media
  query on purpose: it asks for the window's HEIGHT, which a container cannot know.
  `.colourways` carries `container-type: inline-size` — **never `size`**, which would
  make the block axis a containment root too, and this element is a flex item inside a
  band whose whole job is dividing height.

- **🟡 Removing an element breaks the WORDS describing it and the TESTS keyed on it.**
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
