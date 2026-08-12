# CMS UX Redesign — Implementation Plan

**Goal:** make cms.wear-run.help fast and safe to run for a 100+ garment catalogue — the computer fills in everything it can measure, the human confirms and publishes.

**Design doc:** [2026-08-10-cms-ux-redesign-design.md](../specs/2026-08-10-cms-ux-redesign-design.md)

**Method:** every automated decision goes in a pure, unit-tested function; the hook / component / Worker route is a thin adapter. That is the existing house pattern (`publishGating.ts`, `importColours.ts`, `attach.ts`) and it is why these rules are testable without a database or a browser.

---

## Rules every task inherits

- `pnpm` is not on PATH — every command below means `npx --yes pnpm@10.33.0 …`.
- **Never rewrite an existing colourway `slug`** (printed on QR tags), **never reorder rows** (row order picks the default colourway), **never switch a colour on** automatically.
- **Never write to a `published` product from an automated process.** `glbAsset` and `colourways` are in `GATED_FIELDS`; the write re-runs the publish gate, and a gate refusing the robot's own write is the 2026-07-29 incident. Copy the two-refusal argument in `apps/shrink/src/attach.ts` verbatim.
- Hook rejections must be `APIError(msg, 400)` — a plain `Error` becomes "Something went wrong."
- `apps/cms` stays on TypeScript 6.0.3. **Run `pnpm build`, not just typecheck** — that gap is how a broken CMS build shipped green before.
- `next dev` dirties `importMap.js` and `next-env.d.ts`. Stop the server, *then* `git checkout --` both.
- Comments explain *why*, citing the incident. Prefer a measurement over an adjective.

---

## Order of work

Sequenced so each task is independently shippable and touches as few files as possible. Phases 1–2 need no new services and no new spend.

| # | Task | Files | Test |
|---|---|---|---|
| 1 | **Report all publish problems at once.** Split `assertPublishable` into `collectPublishProblems(): string[]` + a throwing wrapper. Keep every message string verbatim — they are the spec. | `collections/publishGating.ts:178-231` | extend `publishGating.test.ts` |
| 2 | **Readiness panel.** `ui` field at the top of the Product tab, calling Task 1's function against live form state. Cannot see the artwork verdict (it's on the Media doc) — say so rather than imply it checked. | new `fields/ReadinessPanel.tsx`, `Products.ts` | build + by eye |
| 3 | **Auto web-address-word.** Pure `deriveSlug(name)`; `beforeValidate` on `Products.slug`, **create-only and empty-only**. | new `fields/deriveSlug.ts`, `Products.ts:249` | new `deriveSlug.test.ts` |
| 4 | **Live upload status.** Custom `Cell` on `RawUploads.status` polling `/api/raw-uploads/:id` every 5s while queued/processing, stopping dead on a terminal status. Removes the "refresh every minute or so" instruction from the owner's guide. | new `collections/RawUploadStatusCell.tsx`, `RawUploads.ts` | by eye |
| 5 | **Widen the colour palette.** `PALETTE` has 28 entries and **is missing `Wine` and `Butter` — two of N001's own five colourways.** Add ~18 (Wine, Butter, Mint, Turquoise, Khaki, Beige, Ivory, Plum, Magenta, Emerald, Cobalt, Indigo, Terracotta, Mauve, Camel, Mocha, Bottle Green, Denim). ⚠️ Terracotta `#E2725B` collides with the existing Coral — resolve, don't ship both. | `tools/asset-pipeline/src/colour-name.ts:78` | extend `colour-name.test.ts`; every **pre-existing** case must still pass |
| 6 | **Auto colour slug + photo description.** `beforeValidate` on the colour row's `slug` (empty-only) and `altText` (`"{productName} in {colourName}"`, empty-only). Removes up to 1,000 hand-typed sentences. | `fields/colourways.ts` | new `colourways.test.ts` — must include "never rewrites an existing slug" |
| 7 | **Pre-select the obvious colour.** In `SourceVariantSelect`, when the row name equals a high-confidence measured name and nothing is chosen, select it. ⚠️ Hooks must sit **above** the early return at line 71. | `fields/SourceVariantSelect.tsx` | by eye |
| 8 | **Add the file's colours automatically.** New pure `planColourImport(product, fileColours)` in the shrink worker, mirroring `attach.ts`: draft only, **zero existing rows** only, every row `active: false`, low-confidence rows unnamed. Separate PATCH from the `fileColours` write so a failure can't lose it. | new `apps/shrink/src/importPlan.ts`, `index.ts:351` | new `importPlan.test.ts` |
| 9 | **Catalogue Defaults global.** Holds `customisationIntro`, `customisationSteps`, `catalogueUrl`, `retiredMessage`. Products read them via async `defaultValue` — **create-only**, so existing products are never rewritten. | new `globals/CatalogueDefaults.ts`, `payload.config.ts`, `Products.ts` | `migrationReplay` |
| 10 | **Duplicate a product.** `beforeDuplicate` on `productCode`/`slug` (suffix), and on `glbAsset`/`fileColours`/`fileColourDetails` (null) and `status` (`draft`) — a copy must not inherit another file's model or mappings. Without this, duplicate hits a unique constraint. | `Products.ts` | by hand |
| 11 | **Media folders.** `admin.folders: true`. ⚠️ **Beta in 3.86** — accepted deliberately; record that in the commit. | `Media.ts` | `migrationReplay` |
| 12 | **Dashboard.** Server view listing files processing, drafts ready, and drafts blocked (reusing Task 1). ⚠️ Don't silently cap the list — print what was dropped. | new `views/Dashboard.tsx`, `payload.config.ts` | build + by eye |
| 13 | **Bare `/render` route on the viewer.** Params `model`, `variant`, `orbit`, `fov`. **Reject any `model` not on our media host.** Sets `window.__RENDER_READY` after load + `jumpCameraToGoal()` + two rAFs. Needed because the public viewer won't serve a **draft**. ⚠️ `min-field-of-view="1deg"` — the default floor is 12deg and silently ignores anything tighter. ⚠️ `src`/`variantName` are **properties**, not attributes. | new `apps/viewer/src/render/` | new e2e spec |
| 14 | **Photograph every colour.** Pure `planPosters()` (draft only, never replaces an owner's photo, skips rows with no variant chosen), then **one browser session per garment** — load the 30 MB model once, switch `variantName`, screenshot each. PNG with `omitBackground` (no sharp on Workers; poster shows in both themes). `browser` binding in `wrangler.jsonc`, `@cloudflare/puppeteer`. **Always `browser.close()` in a `finally`.** | new `apps/shrink/src/posters.ts`, `index.ts`, `wrangler.jsonc` | new `posters.test.ts` |
| 15 | **Live preview.** `frame-ancestors 'none'` → `'self' https://cms.wear-run.help`, then `admin.livePreview` on Products. ⚠️ Change the CSP **test** first. A draft still won't preview — correct, don't "fix" it by exposing drafts. | `apps/viewer/scripts/csp.mjs:95`, `csp.test.ts`, `Products.ts` | `csp` test + live check |

---

## Two cost facts that decide task 14's shape

- Workers Paid includes **10 browser-hours/month**, then $0.09/hr. Batched per garment ≈ **1.7 hours for 100 garments**; a session per *colour* costs ~5× the same output. Do not "simplify" it into a loop of sessions.
- Container budget is **~40–60 shrink jobs/month at $0 extra**. 100 garments over a year is ~8/month and fits; 100 in one month does not. Stage the intake.

---

## Per-task loop

Failing test → run it, watch it fail → minimal implementation → run it, watch it pass → `pnpm lint` → commit. One task per commit.

## Before merging

```bash
npx --yes pnpm@10.33.0 install --frozen-lockfile && npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test && npx --yes pnpm@10.33.0 build
```

- `pnpm eval:artwork` (gates the deploy) and `pnpm eval:artwork:real` **on an idle machine** — task 5 changes container behaviour, and a busy run reads ~0.48pp low.
- Task 5 needs a **container redeploy** (the image copies `tools/asset-pipeline`). Confirm with `wrangler containers list` — compare `LAST MODIFIED` to the commit date.
- Tasks 9 and 11 generate migrations: **read the SQL**. Anything that rebuilds a table must be hand-written — on D1 a `DROP` runs an implicit `DELETE` that cascades and `PRAGMA foreign_keys=OFF` is a no-op.
- Take a D1 backup and capture `GET /api/public/viewer/n001/wine` before merging.
- After task 14's first real run, **open a poster and look at it.** A mis-aimed camera doesn't error — it produces a plausible photograph of the wrong thing.

## Deliberately not in this plan

Responsive images (needs Cloudflare Images; `sharp` can't run on Workers — separate spend decision) · QR generation · per-garment artwork calibration at scale (every garment still gets the three automatic structural gates; the rendered per-garment ceiling is ~30 min of human attention each — decide it, don't discover it at garment 40).
