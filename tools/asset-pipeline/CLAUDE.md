# CLAUDE.md — the GLB pipeline

Moved out of the repo-root `CLAUDE.md` on 2026-08-12 by `/doctor`, for the same
reason the viewer traps moved to `apps/viewer/CLAUDE.md` on 2026-08-10: the root
file is loaded into *every* session in this repo, and this section is only ever
needed by a session that is actually touching the pipeline. It loads
automatically the moment you touch `tools/asset-pipeline/`. Paths below are
repo-root-relative, as they were before the move.

The root `CLAUDE.md` remains the authority on everything else — in particular the
pipeline **traps** (never run the pipeline on its own output, `--simplify-error`
vs `--simplify`, the `opaque` default mismatch, the three blocking gates) are
still there, because they are cited from source comments and cross subsystems.
Read both before changing anything here.

## This directory has TWO lockfiles, and only one of them pnpm maintains

**If you change `tools/asset-pipeline/package.json`, you must regenerate
`package-lock.json` by hand, or the container deploy fails on `main`.**

`pnpm-lock.yaml` is the workspace's. `package-lock.json` here is **npm's**, is
consumed only by `apps/shrink/Dockerfile`, and **no workspace tooling ever touches
it** — so a dependency bump made in the workspace desynchronises it silently.

Measured 2026-08-12 on the dependency refresh merged as `9c22a2a`: five packages
drifted (`@playwright/test` 1.62.0→1.62.1, `@types/node` 26.1.1→26.2.0, `tsx`
4.23.1→4.23.12, `playwright` and `playwright-core` 1.62.0→1.62.1) and the Docker
build died on `npm ci` with *"can only install packages when your package.json
and package-lock.json are in sync"*.

**Note where it did not surface — this was the whole trap.** `lint`, `typecheck`
5/5, 621 tests, `build`, and the container's own `tsc --noEmit` were *all green*,
because **none of them run `npm ci`**. The root `CLAUDE.md` already says
`apps/shrink/container` "is not a workspace member… it has its own CI typecheck
step"; the typecheck step was never the gap. `npm ci` is, and it lives one
directory away, here.

✅ **CAUGHT LOCALLY SINCE 2026-08-13 — this paragraph said until then that "the
only thing that executes this path is the Docker build triggered by a push to
`main`", and that is no longer true.** `scripts/check-lockfile-sync.mjs`
reproduces `npm ci`'s own sync rule with no npm, no network and no install, and
runs inside `pnpm test` via `apps/cms/src/lockfileSync.test.ts`. It also fails on
the `"resolved": "file:"` paths that appear when the lockfile is regenerated
inside the pnpm workspace — the other half of the procedure below. **Still
regenerate by hand when you change `package.json`;** what changed is that
forgetting now costs seconds instead of a deploy.

Regenerate **in a temp dir, never in the workspace** — pnpm's symlinked
`node_modules` makes npm write `file:` paths that do not exist inside the image
(the reason is also stated in the Dockerfile above the failing line):

```bash
cd $(mktemp -d) && cp ~/Sites/Model-Viewer-main/tools/asset-pipeline/package.json . \
  && npm install --package-lock-only
```

Then copy `package-lock.json` back and check three things before committing:
every version matches `package.json`, `npm ci --omit=dev --no-audit --no-fund`
exits 0, and `grep -c '"resolved": "file:' package-lock.json` returns 0.

## Before you change the pipeline

Do not tune presets against file size. That is exactly how a setting that
protects artwork *less* shipped as "Smallest file" — **deleted on 2026-08-05**
once a sweep rendered what it actually did to the wordmark. Look at the output:

```bash
pnpm eval:artwork                                              # synthetic fixture, ~2 min, gates every deploy
pnpm eval:artwork:real                                         # the REAL N001 export, ~2.5 min, needs raw/
pnpm pipeline textures raw/garment.glb --out output/textures   # no processing
pnpm pipeline render   out.glb --out output/after
pnpm pipeline compare  output/before output/after --out sheet.png
node tools/asset-pipeline/scripts/bisect-artwork.mjs raw/garment.glb --out output/bisect
```

`pnpm eval:artwork` is the fast one — no raw export needed, and it **gates the
deploy** (since 2026-08-06; the CI numbers match a developer Mac to three decimal
places, because the eval diffs two renders from the same browser in the same run,
so the rasteriser cancels).

`pnpm eval:artwork:real` is the same method on the actual 382 MB export. **It is a
MANUAL, LOCAL check** — run it before shipping any preset or pipeline change. It
does not gate the deploy and is not scheduled; the monthly workflow that used to
run it was deleted on 2026-08-07, because the file it needs no longer exists
anywhere a GitHub runner can reach (see below). It needs
`raw/cycling-all-colours.glb`, which is gitignored.

⚠️ **THE RAW EXPORT IS NOT A DURABLE ARTIFACT AND MAY ALREADY BE GONE.** The
ingest bucket carries an `expire-raw-uploads` lifecycle rule — 14 days, **all
prefixes** — so the N001 export (uploaded on/before 2026-08-05) expires around
**2026-08-19**. `scripts/backup-r2.mjs` mirrors the *media* bucket only, so the
ingest bucket is in no backup. The canonical copy is therefore a **local** one,
described by `raw/CANONICAL.json`, which records the byte count and SHA-256 so a
re-downloaded or re-exported file can be proven to be the file the ceiling was
calibrated against. `eval:artwork:real` verifies that checksum and refuses to run
on a mismatch — a different export would otherwise produce a perfectly plausible
number for the wrong garment.

If the object still exists, this is the command — and note the **spaces**:

```bash
wrangler r2 object get "run-apparel-viewer-ingest/cycling all colours.glb" \
  --file raw/cycling-all-colours.glb --remote
```

⚠️ **The R2 key contains SPACES.** It is `cycling all colours.glb`, not the
hyphenated `cycling-all-colours.glb` that everyone types from memory and that this
very file documented until 2026-08-07. The hyphenated form is the *local*
filename, deliberately renamed on download so nothing downstream deals with spaces
in a path; it is not the key. Quote it, or an unquoted expansion splits it into
three arguments and wrangler reports a confusing bucket error.

Both take `--calibrate` to print the damage curve and `--keep <dir>` for the
contact sheets. Both assert a **negative control**: if switching `--uv-weight` off
stops registering as damage, the eval says it has gone blind and fails rather than
passing quietly. **Do not raise either ceiling to make it green.**

⚠️ **`eval:artwork:real` also refuses to run if its camera is not pointed at the
print**, and that guard exists because the obvious framing was wrong. The first
version used render.ts's own `crop-chest` view; on N001 that frames the torso and
hips with the wordmark clipped off the top edge, and `crop-back` shows a zipper.
Those defaults were framed for a t-shirt. A mis-aimed camera does not error — it
produces a perfectly plausible damage number for *fabric*. It was caught by opening
the PNG. Also measured: model-viewer clamps orbit radius, so `fieldOfView` is the
only zoom control that does anything.

`render` needs a Chromium; set `PLAYWRIGHT_CHROMIUM_PATH` where Playwright's own
download is absent.

Read `docs/OPEN-ISSUE-ARTWORK.md` first — it ranks the known causes and records
what has been ruled in and out. Despite the filename it is **closed** (2026-08-05);
it is kept as the case file because the hypotheses it numbers (H3, H4, H6) are cited
by name from six source comments and one test. See the note at the top of it.

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

## A mistyped numeric flag becomes `NaN`, and the defaults do not catch it

`Number(rest[++i])` in `parseOptimizeArgs` yields `NaN` for a missing or non-numeric
value, and the default applied downstream **cannot catch it** — `??` tests
null/undefined, not `NaN`, so `NaN ?? DEFAULT_SIMPLIFY_ERROR` is `NaN`. Measured by
calling the parser: `--simplify-error` with no value, and `--simplify-error 0.OO1`
(letter O), both reach the simplifier as `NaN`. There are no `isNaN`/`isFinite` guards
anywhere in this package and no test covers a malformed numeric flag.

Note which dials these are. `--simplify-error` is the real aggression control, and
`--uv-weight 0` is the artwork eval's own negative control for destroyed artwork — so a
`NaN` weight is an undefined value on the axis that decides whether printed letters
survive. The three blocking gates test `alphaMode`, not decimation, so nothing
downstream objects.

Production is unaffected: the container's flags come from `shrinkFlagsFor`
(`packages/shared/src/shrink.ts`), which returns hardcoded literals from a two-value
enum. This bites manual CLI runs — calibration, sweeps, one-off optimises.
