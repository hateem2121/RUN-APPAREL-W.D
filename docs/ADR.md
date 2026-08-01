# Architecture Decisions — RUN APPAREL 3D garment viewer

> **This file is the source of truth.** It is also loaded into codebase-memory-mcp's
> ADR store so an AI agent sees it at session start — but that store is wiped by
> *every* re-index, so it is re-seeded from this file by `pnpm index:ai`.
> Edit here, never only in the index. See `docs/AI-TOOLING.md`.

Each entry is a decision that cost real time to reach. Reversing one without reading
the linked source will re-introduce a bug that has already happened here. The
per-topic documents in `docs/` remain the full account; this is the summary.

Stack: pnpm monorepo on Cloudflare. `apps/cms` (Payload 3.86 + Next on Workers, D1 +
R2), `apps/viewer` (Vite/React + `<model-viewer>`), `apps/shrink` (Worker + queue +
container), `packages/shared` (core, high fan-in), `tools/asset-pipeline` (GLB CLI).

---

## 1. GLB geometry uses Meshopt — and the viewer MUST set the decoder location

**Decision.** The asset pipeline compresses every production GLB with
`EXT_meshopt_compression` (Meshopt decodes far faster than Draco on low-end mobile,
which is the QR-scan case). `<model-viewer>` ships built-in decoder locations only
for Draco and KTX2, so `meshoptDecoderLocation` must be set explicitly in
`apps/viewer/src/components/Stage.tsx`. `scripts/copy-meshopt-decoder.mjs` copies the
decoder from the installed `meshoptimizer` at dev and build time, so encoder and
decoder cannot drift and the strict CSP (`script-src 'self'`) needs no new host.

**If reversed.** Every compressed model dies with `THREE.GLTFLoader:
setMeshoptDecoder must be called before loading compressed files`. No production
model renders at all.

**Generalisable lesson.** This hid for weeks because the seeded placeholder GLBs are
built with *no* geometry compression — the fixtures were structurally incapable of
exercising the production path, so every test and local check passed while being
wrong. Make fixtures match production **in kind**, not just in shape.

## 2. Decimation is texture-aware, not border-locked

**Decision.** `tools/asset-pipeline/src/simplify-textured.ts` uses meshoptimizer's
`simplifyWithAttributes`, not glTF-Transform's `simplify()` with `lockBorder: true`.

**Why.** Plain `simplify()` sees only vertex positions and smears UVs under printed
logos. `lockBorder: true` fixes that but freezes *every* mesh border — necklines,
cuffs, hems, UV islands — taking the real 373 MB export to 6.0 M triangles / 58.3 MB,
45% over the 40 MB publish ceiling, so nothing could ever be published. With
`simplifyWithAttributes`, UV error sits inside the error budget, so the interior is
free to collapse.

**Corollary, easy to get wrong.** `--simplify` is a **target, not a promise**. Once
the error budget binds, lowering the ratio does nothing. To get a smaller file, raise
the budget or lower the UV weight. And `--uv-weight` does **not** insulate artwork
from a looser `--simplify-error` — UV error is priced *within* the budget, so raising
the budget permits more UV distortion at any weight. Measured table lives in
`simplify-textured.test.ts`.

## 3. The shrunk file is streamed to the CMS, never buffered

**Decision.** `streamMultipart()` in `apps/shrink/src/index.ts` hand-builds the
multipart envelope around the container's response stream.

**Why.** `arrayBuffer()` → `new File([...])` → `FormData` costs two extra full-size
copies inside a Worker isolate capped at 128 MB — 120–170 MB for a 40 MB model.
Bytes must only ever be in flight.

## 4. `@payloadcms/storage-r2` is patched, and the patch is guarded twice

**Decision.** `patches/@payloadcms__storage-r2@3.86.0.patch` fixes a frozen-endpoint
bug that meant the raw-upload inbox never worked.

**When it can go.** Upstream fixed it in `4.0.0-canary.17`, but `latest` is still
3.86.0 and the 4.0 handler signature changed (`extra`→`props`,
`serverHandlerPath`→`endpointPath`, new `name` field). Dropping the patch is a
**Payload 4.0 migration, not a version bump.**

**Two guards — do not weaken either.** pnpm 10 fails install with
`ERR_PNPM_UNUSED_PATCH` if the version key stops matching; **never set
`allowUnusedPatches: true`**. And `storageR2Patch.test.ts` asserts the *installed
bytes* in `node_modules` still contain the fix — covering what pnpm cannot: the patch
being edited, removed, or silently applying to a file upstream changed.

## 5. Payload-generated D1 migrations are drafts, not finished migrations

**Decision.** Every migration in `apps/cms/src/migrations/*.ts` is hand-audited, and
the `-- BACKFILL` blocks are hand-written and load-bearing. Read
`docs/RAW-UPLOAD-PIPELINE.md` **before writing or reviewing one.**

**Three defects in `payload migrate:create` output**, all of which fail or silently
lose data on D1:

1. `PRAGMA foreign_keys=OFF` is a **no-op on D1** — SQLite ignores it inside a
   transaction and D1 wraps statements in one. Get statement ORDER right instead.
2. A table rebuild **cascade-deletes child rows — all of them.** Drizzle rebuilds as
   create-new → copy → `DROP TABLE old` → rename; every child with `ON DELETE
   cascade` is emptied during the DROP. **This reached production on 2026-07-29**:
   the colourways migration logged success and the colours arrived intact, while the
   live page silently lost its "Performance" list and build steps. Enumerate children
   first with a `sqlite_master` query for `REFERENCES <table>`.
3. New columns are emitted into the `SELECT` from the OLD table, which lacks them —
   fails with `no such column`. Drop from both lists and backfill.

Also: circular FKs (`products.default_colourway_id` ↔ `colourways.product_id`) mean
neither table can be dropped first.

**How to verify before shipping.** Replay against a snapshot of the real DB with
`PRAGMA foreign_keys = ON` (node:sqlite defaults them OFF, hiding defects 1 and 2).
Snapshot with `VACUUM INTO`, not `cp` — miniflare's D1 runs WAL, so a file copy loses
committed rows. **Assert row counts for EVERY table, not just the changed one** — the
production incident happened because the harness checked only the target table. And
always diff the public API before/after deploy; that is what actually caught it.

## 6. Migrations apply in a gated CI step, not on cold start

**Decision.** Migrations run in an explicit, observable, blocking CI step before
traffic. A failure blocks the release rather than hanging live requests.

## 7. Worker isolation — never deploy over `run-apparel`

**Decision.** The CMS worker is `run-apparel-viewer-cms` and the database is
`run-apparel-viewer-db`. `run-apparel` / `run-apparel-db` are a **separate, live
site**. This viewer stack is fully isolated and must never be deployed over it.
Called out in the `wrangler.jsonc` comments for exactly this reason.

## 8. Infra cutovers are staged behind flags, never flipped on merge

**Decision.** `apps/cms/wrangler.jsonc` sets `workers_dev: true` **temporarily** —
the viewer calls the CMS via the workers.dev URL (repo variable `VITE_API_BASE_URL`)
to bypass the `wear-run.help` zone's Bot Fight Mode, which challenges
`cms.wear-run.help`. Setting it false is the **last** step of the API cutover; ordered
steps in `docs/RUNBOOK.md` → "API + media domain cutover". `preview_urls: false`
because per-version preview URLs would expose `/admin` on ephemeral hosts.

**Principle.** Merging never risks live traffic; the owner drives coordinated cutovers.

## 9. Publish gating is decided by value, not key presence

**Decision.** `apps/cms/src/collections/publishGating.ts` decides publishability from
field *values*, not from whether a key exists on the incoming document. A partial
update that omits a key must not be read as clearing it.

## 10. Payload v4 readiness is pinned in advance

**Decision.** Every collection and global states `versions: false` explicitly — a
no-op on 3.86 that pins behaviour through the upgrade (v4 defaults versions ON, which
would add six `_versions` tables to D1 and roughly double row-writes per save).
`apps/cms` is deliberately on TypeScript 6.0.3, **not** 7.x, which Next.js 16 rejects.

**Upgrade landmine.** API keys created before v3.46.0 stop authenticating in v4 (sha1
HMAC fallback removed). **`robot@wear-run.help`'s key must be re-saved or regenerated
before upgrading**, or the entire auto-shrink flow dies silently.

## 11. CSP is generated at build time

**Decision.** The API origin is baked in from `VITE_API_BASE_URL` and the
inline-script hash computed from the built HTML, so the policy cannot drift from what
ships and cannot break the live site.

## 12. Dependabot runs in quiet mode

**Decision.** `open-pull-requests-limit: 0` — routine version-bump PRs create branch
clutter a solo maintainer won't action. **Security** PRs still open automatically, and
`audit-ci` blocks high/critical advisories on every change. `minimumReleaseAge: 1440`
(24h) lives in `pnpm-workspace.yaml`, in-repo rather than machine-global.

## 13. A raw upload can never go live

**Decision.** The ingest bucket has no custom domain and no public access;
`RawUploads` is admin/editor-only; the public viewer endpoint reads only
products/colourways/media. Only the shrunk output re-enters Media, where the 40 MB
guardrail applies.

---

## OPEN ISSUE — printed artwork is damaged (blocking)

**Status: open, not diagnosed** (reported 2026-07-29). The first real garment renders,
but printed logos, graphics and words come back *"broken / half visible, half not."*
For a B2B garment reference the artwork **is** the product, so "the 3D loads" is not
success. Full analysis in `docs/OPEN-ISSUE-ARTWORK.md`.

Three candidate causes, most to least likely: (1) decimation distorting UVs — the
current "Smallest file" preset is the most aggressive and is very likely *worse* for
artwork than "Balanced"; (2) texture compression destroying decals — several
artwork-shaped textures are 0–13 KB, and a 2048×2048 in 13 KB is not a legible
graphic; textures are only 2.1 MB of 19 MB, so quality is the **cheap lever**;
(3) alpha handling — `solidifyMaterials` forces `BLEND → OPAQUE` on every material,
which would read exactly as "half visible"; `--keep-transparency` is a one-flag test
and would be a complete explanation. **Check (3) first.**

**Do not repeat.** Do not tune presets without looking at a rendered logo — size
numbers alone produced the current, probably-worse setting. Do not test decimation by
re-running the pipeline on pipeline **output**: re-processing an already
meshopt-quantized GLB is meaningless, because attributes are no longer `Float32Array`
and `simplifyTextured` silently falls back to a border-locking path and does nothing.
That trap wasted time twice. Always work from the **raw** file.

---

## Index hygiene (codebase-memory-mcp)

`.cbmignore` excludes `apps/cms/src/migrations/*.json` — generated `payload
migrate:create` schema snapshots that were 53% of the graph with no query value. The
migration **logic** is in the sibling `.ts` files and stays indexed.
`.codebase-memory.json` maps `.jsonc` → `json` so the `wrangler.jsonc` deploy configs
are visible.

**Three traps, all verified 2026-08-01:**

1. Re-indexing an existing project is **incremental** and does **not** re-apply
   ignore rules to unchanged files. After editing `.cbmignore` you must
   `delete_project` first, or the change silently does nothing.
2. **Every re-index wipes this ADR store** — not just `delete_project`. That is why
   this file exists in the repo and why `pnpm index:ai` re-seeds it automatically.
3. `search_graph` cannot see config files (BM25 filters Variable nodes), and the
   `Route` node list is mostly test-file string literals, not an API inventory.
