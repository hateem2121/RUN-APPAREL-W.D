# N001 production polish — design

**Date:** 2026-08-05 · **Status:** IMPLEMENTED — see
[SESSION-2026-08-05.md](../../SESSION-2026-08-05.md) for what actually happened,
including two corrections this spec got wrong (the sweep varied the wrong knob;
`lockBorder` no longer exists) and one prediction that did not fire (the slug
collision, avoided by writing all five rows in a single PATCH).

**Not done:** workstream 2's outcome — run C at 27 MB — is verified but not
applied, pending an owner decision. The CSP fix needs a Cloudflare dashboard
toggle.

## Context

The artwork bug that has blocked this project since 2026-07-29 is **fixed and, as
of today, verified visually**. The owner ticked Retry at 05:46:02 UTC; the pipeline
produced `cycling-all-colours-optimized-3.glb` (Media #11, 37.7 MB,
`artworkVerdict: ok`), which was rendered and inspected, and then attached to the
product. `viewer.wear-run.help/n001/navy` now serves it.

That closes the mechanism *and* the render — the two claims this repo insists on
separating. What it exposes is everything that was hidden behind it: the garment
now renders correctly, and it is surrounded by placeholder data from initial
setup.

This spec covers finishing the job so N001 can be shown to a customer without
caveats, and locking the artwork fix so it cannot regress.

### Measured state (2026-08-05, from the live file)

All 26 artwork material instances resolve to `MASK` / `alphaCutoff 0.5`.
Whole-file census `{ OPAQUE: 174, MASK: 26 }` — zero BLEND.
`findArtworkAlphaProblems` is empty.

| texture | size | transparent | opaque | mid | character |
|---|---|---|---|---|---|
| `Teamwear Logo` | 1823×1288 | 55.90% | 43.69% | 0.41% | `binary` |
| `TEAM WEAR FRONT LABEL` | 4096×1821 | 18.77% | 80.70% | 0.53% | `binary` |
| `Zipper 3_TapeFabric` | 274×576 | 0.00% | 99.33% | 0.67% | `binary` |
| `RUN LOGO` | 2031×550 | 67.01% | 32.10% | 0.90% | `binary` |
| `THE EXTRA MILE (Slogan)` | 1944×121 | 66.38% | 30.04% | **3.58%** | `graded` |

**Only the Slogan ever needed the fix.** The other four are `binary` at 0.41–0.90%
mid and resolved correctly under the old 0.02 threshold. `CUTOUT_MID_FRACTION` is
load-bearing for exactly one texture in this garment, with a 28% margin.

The bytes-per-pixel advisory fired on three textures. All three were extracted at
native resolution and are **completely intact** — #15 is legible down to its
6-point caution text. Advisory-not-blocking was the right call, now demonstrated.

## Decisions taken (owner, 2026-08-05)

| Question | Decision | Consequence |
|---|---|---|
| Physical QR tags printed? | **No** | Colourway slugs are **free to change** — this spec is the only window before they are frozen forever. |
| Product name | **Sensible placeholder** | "Velocity Performance Tee" → an accurate description of a women's cycling skinsuit. Owner refines later. |
| 37.7 MB vs logo quality | **Find the middle ground** | Time-boxed experiment, side-by-side evidence, owner decides. Keeping 37.7 MB is an acceptable outcome. |
| Which colours ship | **All 5, measured names** | Maroon / Blush / Cream / Lime / Black. Maroon and Cream were low-confidence — owner confirms from swatches before publish. |
| Scope | **All of it, safe order** | Separate reviewable changes, not one commit. |

## Constraints

- **Never run the pipeline on its own output.** Meshopt quantizes vertex
  attributes and `simplify-textured.ts` silently falls back to position-only.
  Every experiment run starts from the raw CLO export.
- **Row order decides the default colourway.** Nothing may reorder colour rows.
- **340 tests is the floor.** Any drop is a regression.
- Slugs become permanent the moment tags are printed. After this spec ships, treat
  them as frozen.
- `apps/cms/src/payload-types.ts` is generated — regenerate, never hand-edit.
- Raw export: `run-apparel-viewer-ingest/cycling all colours.glb`, 364.4 MB,
  reachable with `wrangler r2 object get … --remote` (verified today).

---

## 1. Lock the artwork fix

**Problem.** The fix is correct and nothing prevents its removal. The seeded
practice model carries **one** synthetic logo — a clean binary cutout — while
production carries **five** real ones, and the shape that actually broke
production (high ink coverage, 3.58% mid) exists nowhere in the test chain. This
is the repo's signature failure mode, third occurrence.

**Design.**

- Extract the real `THE EXTRA MILE (Slogan)` alpha channel (1944×121, single
  channel, a few KB) from the raw export into
  `tools/asset-pipeline/src/__fixtures__/`. Assert `profileAlpha` returns
  0.6638 / 0.3004 / 0.0358 on it. This replaces the synthetic `wordmarkImage()` at
  `pipeline.test.ts:807`, which approximates the proportions with painted stripes.
- Extend `tools/asset-pipeline/src/placeholders.ts` so each seeded colourway
  carries **five** artwork materials matching the five measured profiles above,
  routed through `merge --meshopt` so the fixture is compressed as production is.
  `seed:assets` already passes `--meshopt`, so only the material count changes.
- Extend the existing end-to-end test (`pipeline.test.ts:306`, which already drives
  `parseOptimizeArgs` → `optimizeGlb`) onto that fixture, and add the shrink
  worker's `PermanentJobError` layer, which nothing currently exercises.
- **Negative controls.** Revert each of `CUTOUT_MID_FRACTION`,
  `CUTOUT_MIN_TRANSPARENT` and `OPAQUE_FACTOR_THRESHOLD` in turn and confirm the
  matching gate engages. A test that cannot fail is this repo's signature failure.
- Add the one missing sidedness assertion: a material that *becomes* `MASK` inside
  `solidifyMaterials` keeps its incoming sidedness. Verified true by inspection
  today (10/26 double-sided, matching source) but unpinned by any test.

**Done when:** each of the three gates is proven to engage on a compressed,
textured, UV-carrying, five-artwork fixture, and reverting any one constant turns
a test red.

## 2. Size experiment

**Problem.** 37.7 MB, against an 8 MB mobile guideline and a 40 MB hard cap — 2.3
MB of headroom. This is a QR-scanned, phone-first product.

**The trade-off is real and already documented.** `RUNBOOK.md` records that on this
garment, `--simplify-error 0.001` with borders unlocked gave 14.2 MB **but tore the
printed logos**; `lockBorder` at the same budget gave 36.1 MB. The current 37.7 MB
is the price of intact artwork, not a regression.

**Texture compression is not the lever.** Of 37.7 MB, roughly **1.3 MB is
textures** — the rest is geometry. KTX2 (already supported via `--ktx2`) would save
well under a megabyte of transfer. It is worth noting for GPU memory on phones, but
it does not address this problem and is out of scope here.

**Design.** Six runs from the raw export, each independent, all `--meshopt`.

> **Corrected during implementation.** This table first swept `--simplify`.
> `packages/shared/src/shrink.ts` says why that is wrong: *"ratio is a target, not
> a promise — the simplifier stops early when the error budget binds. Lowering
> `--simplify` alone therefore does nothing once the budget is the binding
> constraint."* Four of the six runs would have produced near-identical files and
> read as "nothing helps". `lockBorder` is also gone — replaced by the
> attribute-aware simplifier, so the sweep varies `--simplify-error` and
> `--uv-weight`, the knobs that still exist.

| run | `--simplify-error` | `--uv-weight` | ratio | purpose |
|---|---|---|---|---|
| A | 0.0005 | 1 | 0.05 | **balanced**, as shipped — reproduce the 37.7 MB baseline |
| B | 0.0002 | 2 | 0.05 | **fidelity**, as shipped — the safest preset |
| C | 0.001 | 1 | 0.05 | budget ×2 |
| D | 0.001 | 2 | 0.05 | budget ×2 with stronger artwork weighting |
| E | 0.002 | 1 | 0.02 | **small**, as shipped |
| F | 0.005 | 1 | 0.05 | budget ×10 — **expected to fail the gates** |

Implemented as `tools/asset-pipeline/scripts/sweep-size-vs-artwork.mjs`, which
drives `parseOptimizeArgs` (not a hand-built options object, which would default
`opaque` to false and make every run look like an alpha failure) and records
per-run size, `artworkAtRisk`, `findArtworkAlphaProblems`, and every artwork
material's resolved `alphaMode`/`alphaCutoff`.

For every output record file size, `findArtworkAlphaProblems`, `artworkAtRisk`,
the five artwork alpha profiles, and a rendered chest crop. Produce one contact
sheet: size against legibility. F is included as the expected-failure control — a
sweep where everything passes has not found the edge.

**Cost:** six runs on a 364 MB input. Abort the sweep and report if it exceeds
roughly two hours of wall-clock.

**Explicitly acceptable outcome:** nothing beats 37.7 MB with intact artwork, and
we keep it. Report that plainly rather than shipping a smaller file that fails the
gates.

**Done when:** the owner has a side-by-side sheet and has chosen a setting. If the
choice is a new file, it goes through the normal Retry path — not a hand-built
upload — so the gates run.

## 3. Real poster images

**Problem.** Every poster is a **hand-drawn SVG t-shirt** generated by
`posterSvg()` in `placeholders.ts`. The product is a women's cycling skinsuit.
These are shown in two places a customer actually looks:

- while the 37.7 MB model downloads — the first thing a phone visitor sees;
- as the fallback when WebGL is unavailable or the model fails.

`product.posterFallback` is additionally `null`.

**Design.** Render all five colourways from the final GLB with
`pnpm pipeline render --variant`, keeping the existing poster framing and label
treatment so the page's visual language is unchanged. Encode WebP at the current
dimensions (1200×1500). Upload to Media, attach per colourway, and set
`posterFallback`.

**Done when:** no placeholder t-shirt remains reachable from the live site, and the
poster shown for each colourway matches the garment that colourway renders.

## 4. Colour data

**Problem.** Three rows named Navy / Black / Crimson with seeded swatches
(`#22314E`, `#17181A`, `#8C1F2F`) describe a garment whose measured colours are
Maroon `#825353`, Blush `#F7CDCD`, Cream `#FDFDC8`, Lime `#8FDE60`, Black
`#262727`. Two colourways are not exposed by the public API at all.

**Design.** Drive `ImportColoursFromFile` to append the unmapped colours, then
correct the three existing rows' `displayName`, `slug` and `hexSwatch`, and
activate all five. Target state, in existing row order:

| row | variantId | name | slug | swatch | was |
|---|---|---|---|---|---|
| 1 | Colorway 2 | Maroon † | `maroon` | `#825353` | Navy / `navy` / `#22314E` |
| 2 | Colorway 3 | Blush | `blush` | `#F7CDCD` | Black / `black` / `#17181A` |
| 3 | Colorway 4 | Cream † | `cream` | `#FDFDC8` | Crimson / `crimson` / `#8C1F2F` |
| 4 | Colorway 5 | Lime | `lime` | `#8FDE60` | (not exposed) |
| 5 | Colorway 6 | Black | `black` | `#262727` | (not exposed) |

† low-confidence match — owner confirms from a rendered swatch before publish.

Note row 5 takes the slug `black`, which row 2 currently holds. The rename of row 2
must land before row 5 is activated, or the import's collision guard will assign
`black-2`. This ordering is the one genuinely fragile step in this workstream.

Slug changes are safe **only because no tags are printed**; record that in the doc
so the next person knows the window has closed.

Maroon and Cream arrived low-confidence, so the import contributes their swatch and
an empty name rather than a guess. Present both to the owner as rendered swatches
for confirmation before publish.

Row order is preserved throughout — it decides the default colourway.

**Done when:** `/api/public/viewer/n001/<slug>` returns five colourways whose names
and swatches match what renders, for every slug.

## 5. Colour buttons

**Problem.** Two distinct defects.

- **`hexSwatch` is never rendered.** It exists in the CMS, in `projectViewer.ts`,
  in `ViewerColourway`, and in the live API response — and `ColourwayTabs.tsx`
  ignores it. The buttons show a two-digit number and a name, no colour. The data
  has been plumbed end to end and never consumed.
- **The hover preview is a static image in a 132 px box** pinned bottom-left, while
  the real garment sits in the viewport at full size. Hovering "Black" shows a
  small drawing rather than the garment.

**Design.** Render the real swatch on each button. On hover or focus, switch the
loaded `<model-viewer>` variant so the actual garment changes colour — the model
is already in memory and carries all five variants, so this costs nothing and is
strictly better than a thumbnail. Debounce to avoid thrashing on fast pointer
travel, restore the selected variant on mouse-out, and keep the poster preview as
the fallback for when the model has not loaded.

Preserve the existing accessibility contract: `isCoarsePointer()` suppresses hover
preview on touch, selection is never colour-only (the `●` marker and
`aria-selected` stay), and swatches get an accessible name rather than being
presented as meaningful colour alone.

**Done when:** each button shows its true colour, hovering changes the garment in
the viewport, and the a11y suite still passes across all five scanned states.

## 6. Sweep

- **Live CSP violation.** An inline script is blocked in production:
  the policy allows `sha256-wT6H9Hq…`, the page ships
  `sha256-aKWSW3lEPoxL6Lk6+JWznhI4FLNJudH35DZzO4yFOBw=`. Observed in the browser
  today. Diagnose the source (Cloudflare beacon injection is the leading
  candidate), then fix the policy or the injection — not by widening to
  `unsafe-inline`.
- **Product identity.** `productName` "Velocity Performance Tee", category
  "Sportswear", and the fabric/fit copy all describe a tee. Replace with an
  accurate placeholder per the owner's decision.
- **`RGBELoader has been deprecated. Please use HDRLoader instead.`** — a warning
  from model-viewer 4.3.1 (already the latest release) on the
  `environment-image` path. Assess only; no action unless it becomes an error.
- Anything further found during the work is recorded here rather than fixed
  silently.

**Done when:** the browser console on the live product page is clean of errors.

---

## Testing

Each workstream ships with its own tests and its own commit.

- Workstream 1 is itself the test work; its negative controls are the acceptance
  criterion.
- Workstreams 3–5 get before/after screenshots from the real browser, plus the
  existing Playwright suite across Chromium / WebKit / mobile Safari / Firefox.
- Workstream 4 is verified against the live API, not only the database.
- The `scripts/smoke-viewer-payload.mjs` check added earlier today runs after any
  deploy and fails if the payload stops carrying a fetchable model.

**Regression floor: 340 unit tests** (shared 28, pipeline 136, shrink 30, viewer
27, cms 119) plus 66 e2e, five workspaces plus the non-workspace container
typecheck.

## Error handling

- Any new GLB reaches production through the CMS Retry path so the three blocking
  gates run. No hand-built pipeline invocation ships a file.
- Colour edits are additive-then-corrective: import appends inactive rows, and the
  existing rows are edited deliberately. Row order is never touched.
- Take a D1 backup before the colour work. `backups/d1/` already holds a verified
  complete `predeploy-2026-08-04-06-00-38.sql` (68 KB, 16 tables) as the pattern.

## Out of scope

- KTX2 texture compression — measured as under 1 MB of the 37.7 MB. Revisit only
  if GPU memory on phones becomes the observed problem.
- Raising the 40 MB cap and admin upload progress — both deferred pending
  `clientUploads: true`, unchanged by this work.
- Any refactor not serving the six items above.
