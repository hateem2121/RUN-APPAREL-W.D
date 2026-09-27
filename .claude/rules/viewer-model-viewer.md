---
paths:
  - "apps/viewer/src/components/Stage.tsx"
  - "apps/viewer/src/components/stageConfig.ts"
  - "apps/viewer/src/lib/**"
  - "apps/viewer/e2e/webgl.spec.ts"
  - "tools/asset-pipeline/src/review-server.ts"
---

# The viewer's `<model-viewer>`: decoders, materials, camera and rendering

Moved from `apps/viewer/CLAUDE.md` on 2026-09-26, word for word, so these load only when you
open the files they govern (`docs/CLAUDE-MD-MAINTENANCE.md` explains the mechanism).

## Traps

- **🟡 model-viewer BAKES the draco and ktx2 decoder locations at MODULE-EVALUATION
  time, and there is NO equivalent line for meshopt — which is why meshopt always
  worked here and draco rendered nothing until `Stage.tsx` seeded the global.** `lib/features/loading.js` runs, at
  import:

  ```js
  const ModelViewerElement = self.ModelViewerElement || {}
  const dracoDecoderLocation =
    ModelViewerElement.dracoDecoderLocation || DEFAULT_DRACO_DECODER_LOCATION
  CachingGLTFLoader.setDRACODecoderLocation(dracoDecoderLocation)
  ```

  So it reads a GLOBAL that must exist 🟡 **before** the import; meshopt has no default
  and is set only by the post-import setter. `Stage.tsx` set all four the same way
  after the import, and the two that look identical behaved oppositely. Measured on
  a cold load of the live site 2026-08-21: `dracoDecoderLocation` =
  `https://www.gstatic.com/draco/versioned/decoders/1.5.6/`, `meshoptDecoderLocation`
  = `/meshopt_decoder.js`. **A draco garment therefore rendered nothing in
  production** — the CSP correctly refused gstatic — and fell back to its poster.
  `Stage.tsx` now seeds `self.ModelViewerElement` before the dynamic import, per
  model-viewer's own docs — 🟢 **verified live 2026-09-24**: a cold load of
  `viewer.wear-run.help/rxps/wine` reads `/draco/`. A local harness cannot show it: the
  `dist` build registers its own global (`dist` reads `undefined`, live read gstatic).
  Production stays on `--meshopt` (`packages/shared/src/shrink.ts`) for size and GPU
  weight (LIVE-08); **before re-enabling `--draco`, re-run that check cold on the
  deployed site: `customElements.get('model-viewer').dracoDecoderLocation === '/draco/'`.**
  🟡 Three wrong diagnoses preceded the right one, all plausible, all disproved by
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
  🟡 **6 biased and 20 never**. Variant-only materials are constructed with an empty
  `Set` plus a `LazyLoader` (`lib/features/scene-graph/model.js`), and the backing
  getter returns `this[$correlatedObjects].values().next().value` — `undefined`. So
  the decal depth bias shipped, was committed, was deployed, and left four of five
  colourways flickering. **`variant-applied` fires after `await
  model[$switchVariant]()` resolves**, which is when the rest become reachable;
  `Stage.tsx` re-applies there. Verified in a browser: 11/11 biased on load, then
  16/16, 21/21, 26/26 as each colourway was visited.
  🟡 **`isLoaded` is PUBLIC and is what separates the two silences** — "this
  colourway is not open yet" (normal, quiet) from "the internal symbol is gone"
  (report it). The first version collapsed both into one counter that nothing read,
  which is how 156 misses stayed invisible.
  🟡 **The seeded fixture could not exhibit this** — its colourways built identical
  artwork materials, so `dedup()` merged them into one always-eager material: 6 MASK,
  6 eager, **0 lazy** against production's 26/6/20. `PlaceholderColourway.ink` now
  tints each colourway's print as a real CLO export does. A test here must assert the
  swap loaded NEW cut-outs before asserting they are biased, or an inadequate fixture
  passes it silently.

- **🟡 THE SOFT SHADOW COSTS NOTHING PER FRAME — do not "optimise" it.** Measured
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

- **model-viewer treats a 2px tap as a COMMAND, and the miss branch zooms right
  out.** `disable-tap` is set since 2026-08-19; the reasoning, including why
  `disable-pan` is deliberately NOT used, is on `DISABLE_TAP` in `stageConfig.ts`.

- **model-viewer's CAMERA reads the ATTRIBUTE, and setting the property silently did
  nothing.** Measured 2026-08-27 while framing a decal: `mv.cameraOrbit = '68deg 90deg
  auto'` followed by `jumpCameraToGoal()` left `getCameraOrbit()` at the old value, so
  a "grazing angle" comparison was really two head-on frames. It is a lit element —
  `setAttribute('camera-orbit', …)`, then **`await mv.updateComplete`**, then
  `jumpCameraToGoal()`. The reverse of the `src` trap below, which is why both are
  here: **verify a camera move by reading `getCameraOrbit()` back** before trusting
  any frame it produced.

- **🟡 React sets `src` on a custom element as a PROPERTY, never an attribute.**
  `el.getAttribute('src')` on `<model-viewer>` is always `null` — its attribute
  list carries `camera-orbit`, `tone-mapping` and a dozen others and no `src`.
  Code that keyed off it silently compared empty strings forever.

- **🟡 `webglcontextlost` never reaches your listener.** It fires on the `<canvas>`
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

🟢 **AND IT DID NOT FIX THE OWNER'S DEFECT — the NEAR PLANE did, 2026-08-29.**
model-viewer pins `camera.near` at 0.00436 m and the depth step grows with **z²**, so
zooming OUT cut the margin over CLO's 0.100 mm print offset to **1.5×** (5.1× in —
"perfect zoomed in, blinks out"). `camera-near-plane.ts` fixes it, as a property
OVERRIDE since model-viewer rewrites `near` every camera change. KEEP the pipeline
`depthBias` path: p001 at 0.001 mm still lands ~4×. Logos never fought — BLEND never
writes depth.
