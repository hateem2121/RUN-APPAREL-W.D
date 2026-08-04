# CLAUDE.md — working notes for AI sessions on this repo

Read this before changing anything. It is short on purpose: it holds only the
things that have *actually* caused production incidents here, and the traps that
have already cost more than one session each.

Full history is in `docs/HARDENING-LOG.md`; per-session detail in
`docs/SESSION-*.md`; operational how-tos in `docs/RUNBOOK.md`.

## What this is

A QR-deep-linkable 3D apparel viewer. A CLO 3D export goes in, a compressed GLB
comes out, and a customer scans a tag and looks at the garment. **For a B2B
garment reference the printed artwork IS the product** — "the 3D loads" is not
success.

```
apps/viewer   Public 3D viewer (React + <model-viewer>, Cloudflare Pages/Worker)
apps/cms      Payload CMS on Cloudflare Workers + D1 + R2
apps/shrink   Queue-consumer Worker driving a Container that runs the pipeline
tools/asset-pipeline   The GLB pipeline (merge / optimize / validate / diagnostics)
packages/shared        Types + constants both sides must agree on
```

## The one pattern that keeps causing incidents

**Three production bugs in three consecutive sessions were invisible for the same
reason: the test fixtures could not exhibit the failure.**

- Seeded placeholders had no geometry compression → *no production model could
  render at all*, and 177 tests were green.
- Same gap → *every* production garment tripped a CSP violation on load.
- Seeded placeholders had no textures and no UVs → the entire artwork path was
  untested.

**If production compresses, seed compressed. If production prints, seed a
print.** Before adding a test, ask what would have to break for it to fail. If
the answer is "nothing that happens in production", it is not a test.

## Traps — each of these has already cost a session

- **Never run the pipeline on its own output.** Meshopt quantizes vertex
  attributes; `simplify-textured.ts` bails to a position-only fallback when it
  sees them, so a second pass *silently* loses artwork protection and blames the
  wrong stage. Always start from the raw CLO export.
- **`PRAGMA foreign_keys=OFF` is a no-op on D1** (SQLite ignores it inside a
  transaction; D1 wraps statements in one). `defer_foreign_keys` defers *checks*,
  not **cascades** — so neither pragma makes a table rebuild safe. **Ordering
  does**: stage or drop referencing tables first. A `DROP TABLE` runs an implicit
  `DELETE`, and that cascades.
- **`prune()` renumbers texCoords** via `shiftTexCoords`, so a lone second UV set
  becomes `TEXCOORD_0` before decimation. The real hazard is a material sampling
  two or more UV sets at once.
- **`chromaSubsampling` does nothing for WebP** in glTF-Transform's
  `textureCompress` — it is a JPEG/AVIF option sharp ignores. Use `smartSubsample`
  via a direct sharp call.
- **`--keep-transparency` is not the fix for damaged artwork.** `<model-viewer>`
  has no order-independent transparency; restoring BLEND trades one "half
  visible" for depth-sorting artefacts. Use `MASK` with `alphaCutoff 0.5`.
- **`model-viewer.toDataURL()` returns a blank canvas** —
  `preserveDrawingBuffer: false`. Screenshot the element.
- **`apps/shrink/container` is not a workspace member.** It installs with plain
  `npm` inside Docker, so it cannot use `workspace:*` deps, and `pnpm -r` skips
  it. It has its own CI typecheck step; keep it.
- **Any Payload CLI task touching production D1 must set `NODE_ENV=production`**,
  or Payload runs a dev-mode schema push against it.
- **Put nothing but migrations in `apps/cms/src/migrations/`.** Payload's
  `readMigrationFiles` imports *every* `.ts`/`.js` there except `index.ts` and
  treats each as a migration. A test file added there on 2026-07-31 was imported
  during `migrate:remote`, ran `describe()` with no vitest runner, and stopped
  the production deploy. `src/migrationReplay/migrations.test.ts` now guards it.
- **`opaque` defaults DIFFERENTLY in the two ways you can call the pipeline.**
  `parseOptimizeArgs` defaults it **true**; `optimizeGlb` treats an absent
  `opaque` as **false**. So a hand-built options object silently skips
  `solidifyMaterials` and ships decals still on `alphaMode: BLEND`, which
  `<model-viewer>` renders see-through — the reported symptom exactly. Go through
  the parser, as `apps/shrink/container/server.ts` does. Pinned by a test in
  `pipeline.test.ts`.
- **`fileColours` is deliberately NOT in `GATED_FIELDS`.** Gating it once blocked
  the shrink robot's own write on a published-but-model-less product, i.e. it
  prevented recovery from the state the gate was complaining about (2026-07-29).
  Do not "fix" this. The gap it leaves is covered by reporting instead —
  `becameUnverifiedWhilePublished` writes an Events row. See `Products.ts`.
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

## Before you change the pipeline

Do not tune presets against file size. That is exactly how a setting that
protects artwork *less* shipped as "Smallest file". Look at the output:

```bash
pnpm pipeline textures raw/garment.glb --out output/textures   # no processing
pnpm pipeline render   out.glb --out output/after
pnpm pipeline compare  output/before output/after --out sheet.png
node tools/asset-pipeline/scripts/bisect-artwork.mjs raw/garment.glb --out output/bisect
```

`render` needs a Chromium; set `PLAYWRIGHT_CHROMIUM_PATH` where Playwright's own
download is absent.

Read `docs/OPEN-ISSUE-ARTWORK.md` first — it ranks the known causes and records
what has been ruled in and out.

**The pipeline can now REFUSE a job.** Since 2026-08-03 three structural findings
make the shrink worker throw `PermanentJobError` and save nothing:

| Finding | Where it is decided |
|---|---|
| A primitive carrying printed artwork took the position-only decimation fallback | `simplify-textured.ts` → `artworkAtRisk` |
| An artwork material ended on `alphaMode: BLEND` | `texture-artwork.ts` → `findArtworkAlphaProblems` |
| An artwork `MASK` has an `alphaCutoff` other than 0.5 | same |

All three are *structural* — a stated fact about the output file, with no
false-positive case — which is why they block. The bytes-per-pixel measurement
(`findCrushedArtwork`) only **warns**, because a legitimately flat label encodes
just as small as a smashed wordmark, and a gate the owner learns to override is
worse than no gate. Keep that distinction if you add checks.

## Colour names are read from the file, not typed

`tools/asset-pipeline/src/variant-colour.ts` picks each variant's dominant fabric
by surface area (excluding trim and artwork), converts `baseColorFactor` from
linear to sRGB, and names it by CIEDE2000 against a palette in `colour-name.ts`.
This exists because on 2026-08-03 every published colour name on the live site was
wrong — a maroon garment labelled "Navy", a blush one "Black", a powder blue one
"Crimson" — and two colourways in the file were never mapped at all.

Two rules it must keep: a **colourway slug is printed on physical QR tags** and
must never be changed by an automated process, and **row order decides the default
colourway**, so nothing may reorder rows. Imported rows append, arrive
`active: false`, and a low-confidence match arrives with an empty name rather than
a guess. Tested in `apps/cms/src/fields/importColours.test.ts`.

## Before you change a migration

Run `apps/cms/src/migrationReplay/replay.test.ts`. It replays every migration against
real SQLite with foreign keys **on**, seeds every table, and fails if any table
that had rows ends up empty. It exists because a migration once reported success
while cascade-deleting two tables nobody was watching.

The assertion is deliberately **generic**. The ad-hoc check run at the time
looked only at the table the migration was about, which is precisely why it
passed.

## Before you delete anything in the CMS

`isMediaReferenced` (`apps/shrink/src/cms.ts`) and
`scripts/find-orphan-media.mjs` must agree on what "referenced" means — one
deletes, the other only reports. `apps/cms/src/collections/mediaReferences.test.ts`
fails if a new Media relationship is added without updating both.

## Deploying

Merging to `main` runs the pre-deploy D1 migrate and deploys CMS + viewer.
**Take a D1 backup and capture `GET /api/public/viewer/n001/navy` first** — that
before/after diff is what caught the last data-loss incident when the migration
logs said success. See `docs/BACKUP-RESTORE.md`.

## Style

Match the surrounding code: comments here explain *why*, usually citing the
incident that motivated them, and that convention is load-bearing — several of
the traps above are only discoverable from those comments. Prefer stating a
measurement over an adjective.
