# CLAUDE.md — the GLB pipeline

Moved out of the repo-root `CLAUDE.md` on 2026-08-12 by `/doctor`, for the same
reason the viewer traps moved to `apps/viewer/CLAUDE.md` on 2026-08-10: the root
file is loaded into *every* session in this repo, and this section is only ever
needed by a session that is actually touching the pipeline. It loads
automatically the moment you touch `tools/asset-pipeline/`. Paths below are
repo-root-relative, as they were before the move.

The pipeline **traps** moved here on 2026-08-19 and are now at the bottom of this file:
`--simplify-error` vs `--simplify`, the `opaque` default mismatch, the three blocking
gates and what they do not catch, the `fieldOfView` floor, N001's three calibrated
prints. The root `CLAUDE.md` keeps a one-line hook for each — enough to warn a session
that arrives from a source comment — plus the one trap that must fire before you get
here at all (**never run the pipeline on its own output**). Read both; this file is the
authority on the detail.

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

## `output/` is scratch — never judge a garment from it

**Measured 2026-08-19, after the owner caught a plan that was about to do exactly
this.** A session needed the real garment to measure a gesture and reached for the
convenient local copy:

```
output/cycling-all-colours-optimized.glb     14,879,000 B   gitignored, no git history
media.wear-run.help/…-optimized-4.glb        28,271,780 B   what the product serves
```

The two filenames differ by **one character** — the missing `-4` — and the local
one is **47% the size**: a superseded, over-compressed pass whose printed artwork
is degraded. The owner's words: *"it did not properly show the graphics, logos,
etc and we did not use it."* That is this repo's signature failure, recorded at length
in **the three-blocking-gates trap at the bottom of this file** — a sweep rendered the
chest wordmark illegible while **passing all three blocking gates** — and `seed:assets` still prints it as
`5 printed-artwork texture(s) are stored below 0.02 bytes/pixel … RUN LOGO 508x138
at 0.004`.

Why it would have voided the whole measurement rather than merely skewing it: the
acceptance test was *"can a buyer still bring the chest print to centre and READ
it"*, which is unanswerable on a file whose lettering is already gone.

`output/` is gitignored and no current tooling maintains it — `pnpm seed:assets`
writes only `output/n001.glb` and `output/placeholders/`. Everything else in there
is whatever some earlier run happened to leave behind.

**Resolve the real file from the API, every time:**

```bash
curl -s https://cms.wear-run.help/api/public/viewer/rxps/wine \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['product']['glbUrl'])"
```

Cache it locally for repeated use — one 27 MB GET is nothing, but the 15-minute
uptime job is what the root file's R2-egress warning is actually about.

**For a material/alphaMode census you do NOT need the file — RANGE-FETCH the header.**
A GLB's JSON chunk is at the front and is length-prefixed, so two range requests read
every material, texture and variant mapping in it. Measured 2026-08-27 on the live
model: **445,064 bytes instead of 28,271,780** — 1.6% of the egress, and R2 answers
`206` with `cf-cache-status: HIT`.

```bash
URL=https://media.wear-run.help/cycling-all-colours-optimized-4.glb
curl -s -r 0-19 "$URL" | xxd -s 12 -l 4 -e -g4      # JSON chunk length, little-endian
curl -s -r 20-445083 "$URL" | python3 -m json.tool | head
```

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

## A scratch script cannot import this package's dependencies

ESM resolves a bare specifier from the **importing file's** location, so a one-off
script in `/tmp` cannot `import { NodeIO } from '@gltf-transform/core'` however the
workspace is installed — and `NODE_PATH` does not apply to ESM. Cost several rounds
on 2026-08-27. Two things that do work:

```bash
# cwd IS the resolution base for -e, so run it from the package directory
cd tools/asset-pipeline && node --input-type=module -e "import {NodeIO} from '@gltf-transform/core'; …"

# or import by absolute path, resolved once
node -e "console.log(require('./package.json') && require.resolve('@gltf-transform/core'))"
```

⚠️ The `.pnpm` path is **`dist/index.cjs` for `require.resolve`** but ESM needs
`dist/index.js`; and `meshoptimizer` has no `index.module.js`, only `index.js`.
Prefer the `cd` form — it needs no path surgery and cannot drift.

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

## Traps — each of these has already cost a session

Moved out of the repo-root `CLAUDE.md` on 2026-08-19, when that file measured 44,993
characters against Claude Code's 40,000-character warning — the threshold at which it
prints `Large CLAUDE.md will impact performance` and, per Anthropic's own guidance,
adherence to *every* rule in the file starts dropping. These twelve are the ones only a
session touching `tools/asset-pipeline/` needs, so paying for them in every session was
buying worse compliance with the rest.

The intro above used to say these traps stayed in the root file "because they are cited
from source comments and cross subsystems". That reason is preserved rather than
discarded: each one still has a **one-line hook in the root file** naming the danger and
pointing here, so a session that arrives from a source comment is still warned. What
moved is the detail, not the warning.

⚠️ One consequence to know, because it is the cost of this split: after `/compact`, only
the project-root `CLAUDE.md` is re-read from disk and re-injected. This file reloads the
next time Claude reads a file under `tools/asset-pipeline/` — which is exactly when you
need it, but it does mean a compacted session that has not yet opened this directory has
only the root's one-liners. Open this file before changing anything here.

- **`prune()` renumbers texCoords** via `shiftTexCoords`, so a lone second UV set
  becomes `TEXCOORD_0` before decimation. The real hazard is a material sampling
  two or more UV sets at once.
- **`chromaSubsampling` does nothing for WebP** in glTF-Transform's
  `textureCompress` — it is a JPEG/AVIF option sharp ignores. Use `smartSubsample`
  via a direct sharp call.
- **`--keep-transparency` is not the fix for damaged artwork.** `<model-viewer>`
  has no order-independent transparency; restoring BLEND trades one "half
  visible" for depth-sorting artefacts. Use `MASK` with `alphaCutoff 0.5`.
- **A cutout is "few mid pixels" AND "actually cut out somewhere" — never the
  first alone.** `solidifyMaterials` resolves BLEND→MASK on `CUTOUT_MID_FRACTION`
  (0.05), *deliberately looser* than `BINARY_MID_FRACTION` (0.02), because the
  N001 wordmark measures 3.58% mid — 96.42% at the extremes, plainly a cutout,
  and `character` still called it `graded` (i.e. "sheer, leave on BLEND"). But
  raising that ceiling **alone** deletes fabric: a uniformly translucent inset
  covering 2–6% of a map also measures ~2–6% mid, and MASKing it at 0.5 when its
  alpha is ~0.35 discards *every* fragment — a hole, not a hardening, and MASK@0.5
  is exactly what the gate considers correct so nothing catches it. Hence
  `CUTOUT_MIN_TRANSPARENT` (0.05): the wordmark is 66.38% fully transparent,
  those insets are 0.000%. Keep both halves. And keep the two constants separate
  — `character` feeds `isArtworkTexture` → `findArtworkAlphaProblems`, which
  **throws and saves nothing**, so widening it widens a blocking gate.
- **An explicit `baseColorFactor[3]` beats anything inferred from pixels.** glTF
  effective alpha is `factor.a * texel.a`, so a material declaring itself sheer at
  0.4 can never reach `alphaCutoff 0.5` — MASK renders it as *nothing at all*,
  silently, passing every gate. Test `factor < OPAQUE_FACTOR_THRESHOLD` first.
- **`model-viewer.toDataURL()` returns a blank canvas** —
  `preserveDrawingBuffer: false`. Screenshot the element.
  ⚠️ **`toBlob()` IS DIFFERENT AND IS ALSO NOT A MEASURING TOOL.** Measured
  2026-08-27: `toBlob` returns REAL pixels where `toDataURL` is blank —
  1894x1440, 2,724,397 non-blank — so the `preserveDrawingBuffer` reasoning above
  does not apply to it. **But it does not reflect live scene-graph mutations.**
  Painting a decal bright red and diffing two `toBlob` captures reported **0
  changed pixels** while the visible canvas was plainly red. A "0 pixels changed"
  from `toBlob` therefore proves nothing at all — screenshot the element, and
  prove the instrument can see a change you deliberately introduce before
  believing a zero. Separately: **writing a three.js property does not schedule a
  frame.** A no-op write through model-viewer's own
  `setAlphaCutoff(getAlphaCutoff())` does, and unlike nudging the camera it cannot
  move the view being judged.
- **`fieldOfView` under 12° was silently ignored until 2026-08-08 — the SECOND
  camera control model-viewer overrides without telling you.** The orbit-radius
  clamp is already documented above; this is the same trap on the axis that was
  believed to be the reliable one. `min-field-of-view` defaults to **12deg** and
  `render.ts` never set it, so a tighter crop returned a plausible frame of the
  wrong thing. Measured on the real N001 baseline: 1.4° / 2° / 3.1° / 4.5° gave four
  **byte-identical** PNGs (sha256 `294291db…`), 1.9° / 2.7° / 4° / 5.9° likewise,
  and a third print separated only between 9.2° and 13.5° — the floor exactly at
  the documented default. Two consequences worth knowing: `raw/CANONICAL.json`
  *fingerprints* `fieldOfView` rather than range-checking it, so below the floor it
  recorded a zoom nothing used; and the prints listed there as "NOT COVERED"
  (0.039 m hem label, 0.030 m neck logo) were not a scoping choice — **any print
  smaller than roughly a hand was unguardable by construction.** `render.ts` now
  sets `min-field-of-view="1deg"`, pinned by `src/render.test.ts`. N001's 14° view
  is above the old floor and was verified byte-identical across the change, so its
  calibration is untouched. Found by looking at a contact sheet, not by reading code
  — the four identical images were the tell.
- **N001 guards THREE prints since 2026-08-09** — chest wordmark (14°), hem label
  (2.7°), neck logo (3.1°) — and its ceiling went **4.2% → 6.5%** with them. That
  is not a loosened gate: the hem label sits on a curved hem, decimates harder
  than the flat chest print, and is now the worst case in all four rows (balanced
  3.970%, control 10.520%, known-bad 12.330%). A harder view was added; no
  measurement drifted. Three things from that session will save the next one:
  **`--find-views` proposes the zoom that frames the PRIMITIVE**, which on the
  neck logo sliced "RUN" off the bottom edge — the print is two elements and the
  primitive covers one — so the shipped view is one rung wider than proposed, and
  that is visible only in the PNG, never in the number. The camera-fingerprint
  guard **used to refuse `--calibrate` itself**, blocking the one command its own
  error message prescribed and leaving "hand-edit the fingerprint to a value you
  have not measured" as the only way out; it is now exempt there, with a loud
  notice. And `--keep` resolves against the CWD, which `pnpm` sets to
  `tools/asset-pipeline/`, so artifact paths are now printed **absolute** — the
  RUNBOOK's repo-relative one did not exist.
  ⚠️ That calibration was measured on a **busy** machine (the wordmark column came
  back 0.490/2.510/5.290/5.330, an exact match to the busy set recorded above).
  Busy runs read ~0.48pp LOW, so the ceiling is tighter than intended rather than
  looser, and the offset was added back explicitly when choosing 6.5%. Re-run idle
  and append a remeasurement when convenient; **do not lower the ceiling to match
  an idle run's higher `balanced`.**
- **`pnpm eval:artwork:real -- raw/x.glb` did not resolve that path.** `pnpm`
  forwards the `--` separator itself into `process.argv`, and the root script
  delegates via `pnpm --filter`, which runs the child with cwd set to
  `tools/asset-pipeline/` — so a repo-relative path documented in the RUNBOOK
  resolved under the package and step 3 of a five-step procedure failed for anyone
  who copied it verbatim. Relative paths now fall back to the repo root. The lesson
  is the cheap one: **run the documented command, do not read it.**
- **`opaque` defaults DIFFERENTLY in the two ways you can call the pipeline.**
  `parseOptimizeArgs` defaults it **true**; `optimizeGlb` treats an absent
  `opaque` as **false**. So a hand-built options object silently skips
  `solidifyMaterials` and ships decals still on `alphaMode: BLEND`, which
  `<model-viewer>` renders see-through — the reported symptom exactly. Go through
  the parser, as `apps/shrink/container/server.ts` does. Pinned by a test in
  `pipeline.test.ts`.
- **The three blocking gates do NOT catch decimation damage.** They test
  `alphaMode`, which decimation does not change. A six-run sweep from the raw
  N001 export (`tools/asset-pipeline/scripts/sweep-size-vs-artwork.mjs`,
  2026-08-05) rendered the chest
  wordmark illegible at `--simplify-error 0.005` and **every run passed all three
  gates**, `artworkAtRisk` and `findArtworkAlphaProblems` both empty. With
  `--uv-weight` set, the UVs *are* in the error budget, so `artworkAtRisk` cannot
  fire — the budget was merely too loose. **Nothing in this system measured
  whether the letters survived; only a rendered crop did.** This is why the old
  `small` preset was deleted rather than re-tuned.
  **Partly closed on 2026-08-06 by `pnpm eval:artwork`** — it renders the real
  wordmark alpha before and after the real chain and measures how much moved, so
  the *presets* are now watched by something other than memory. Read what it does
  NOT cover before relying on it: it runs on a synthetic fixture, not on a
  production garment, so it catches a preset or simplifier regression and would
  still miss damage specific to a particular CLO export.
  **Closed for N001 later the same day by `pnpm eval:artwork:real`**, which runs
  the same method on the actual 382 MB export. It is **manual and local** — the
  monthly workflow that used to run it was deleted on 2026-08-07, because the R2
  copy it pulled expires after 14 days and the surviving copy is on a laptop no
  runner can reach (see `docs/RUNBOOK.md` → "The canonical raw garment"). Measured
  on the real file: fidelity
  **0.980%**, balanced **2.990%**, sweep run F **5.770%**, `--uv-weight 0`
  **5.810%**, ceiling **4.2%**. Run F is the one that "passed all three gates"
  above — there is now a number that stops it.
  ⚠️ **RUN THIS ON AN IDLE MACHINE.** Measured 2026-08-07, same file (checksum
  verified), same Chromium: **two runs with a test suite/build alongside** gave
  `0.490 / 2.510 / 5.290 / 5.330`; **three idle runs** gave `0.980 / 2.990 / — /
  5.810`, identical to three decimals and reproducing the 2026-08-06 calibration
  exactly. `--keep` was ruled out (idle, with and without → same numbers). Since
  every case is diffed against the same baseline, a *uniform* ~0.48pp offset — not
  scatter — implicates the baseline render, not decimation. Mechanism: `render.ts`
  settles a camera move on `jumpCameraToGoal()` plus **two chained rAFs**, which is
  best-effort rather than a convergence check. The verdict and the contact sheets
  agreed either way. This does not weaken the determinism claim — it qualifies it
  with "idle". **Do not "fix" a small absolute difference; re-run idle first.** The
  first hypothesis here was a Chromium version bump, and it was wrong.
  ⚠️ **Correction while building that: "the sweep remains the authority on a real
  garment" — stated here until 2026-08-06 — was wrong.**
  `sweep-size-vs-artwork.mjs` imports no renderer and renders nothing; it measures
  file size, `artworkAtRisk`, `findArtworkAlphaProblems` and the alpha census. Its
  own recorded output (`output/sweep/sweep.json`) reports `wouldShip: true` for all
  six runs including F. The authority was never the sweep — it was a human opening
  a contact sheet the sweep did not produce. The sweep is still the right tool for
  *where the size floor is*; it was never evidence about letters.
  Two measured findings from building the synthetic eval, both
  counter-intuitive: an **affine** UV mapping cannot smear under decimation at all
  (the first fixture gave an identical 0.150% at every budget from 0.0002 to
  0.02 — useless), and at `--simplify 0.05` on a simple mesh the **ratio binds
  before the error budget**, so 0.001/0.002/0.005 produce byte-identical geometry.
  The eval's negative control is therefore `--uv-weight 0`, not a looser budget.
  Consequently `balanced` (`0.001` since 2026-08-05) is **pinned by an absolute
  test**. Every other assertion in `shrink.test.ts` is relative — fidelity ≤
  balanced, uv weight never below balanced — and `0.001` and `0.005` satisfy all of
  them equally, while one is verified and the other destroys the wordmark. A
  relative invariant cannot pin a value; changing that number means producing a new
  rendered crop, not editing the line.
- **`--simplify` is not the aggression dial — `--simplify-error` is.** The
  simplifier stops early once the budget binds, so lowering the ratio alone does
  nothing. A sweep over the ratio produces near-identical files and reads as
  "nothing helps".
- **A CLO export is mostly THREAD, and the two need different budgets.** Measured
  2026-08-21 on a 1,313,979,936-byte Cycling-Bib export: of 33,964,432 triangles,
  **`Cloth_mesh` — the entire visible garment, carrying all 116 artwork materials —
  is 11,128 (0.03%)**, and 21 `Topstitch_*` meshes hold **99.97%**. `--simplify`
  alone cannot express that and bottoms out at 57.4 MB; `--stitch` (topstitch.ts)
  gives thread its own budget and reaches **20.6 MB** with the prints untouched.
  The stitch meshes carry a flat `baseColor` and **no artwork** — verified by
  walking mesh → primitive → material *including* the `KHR_materials_variants`
  mappings, which is why the looser budget is safe.
  ⚠️ **TWO STACKED MISTAKES make this look broken, and neither is the triangle
  count.** The first attempt frayed the cord into spikes and was rejected on sight:
  it gave thread `error 0.01` (**20x looser** than the garment's 0.001) *and* let
  `--simplify` decimate it a second time (777k → 445k). With a tight budget and a
  single pass, 1.36M triangles is indistinguishable from the 3.98M original. Do not
  read a small output as proof that thread cannot be small. `simplifyTextured` now
  takes `skipMeshes` and `optimize.ts` sets it whenever the stitch pass ran, so
  passing both flags is safe.
  ⚠️ **A WIDE CROP CANNOT SEE THIS — the same lesson as the wordmark, on a new
  feature.** At the default `crop-chest` (18°) the ruined cord looked *identical*
  to the original and was reported as such. At **4°** it is obviously spiky. Judge
  thread with `render --views` at 4–7°.
- **⛔ DRACO DOES NOT LOAD ON THE DEPLOYED VIEWER. Production is `--meshopt`, and
  `--draco` must not be re-enabled until a live cold load proves otherwise.** Shipped
  a draco garment on 2026-08-21: it rendered NOTHING and fell back to its poster,
  with the console showing model-viewer fetching the decoder from `www.gstatic.com`,
  which the CSP correctly blocks. On a cold live page
  `ModelViewerElement.dracoDecoderLocation` reads the gstatic default while
  `meshoptDecoderLocation` correctly reads `/meshopt_decoder.js`. Cause is in
  model-viewer itself and is documented in `apps/viewer/CLAUDE.md`; the fix attempt
  lives in `Stage.tsx` and is **unverified**.
  ⚠️ **This bullet said the exact opposite until the same day** — "smaller AND faster
  … so this needed no viewer change" — which would have shipped an unloadable model.
  The SPEED measurement was real and is worth reclaiming once the viewer is fixed:
  matched builds, CPU-throttled via CDP, median of 3 — 4× throttle **meshopt
  31.0 MB / 1168 ms vs draco 20.6 MB / 908 ms**; 6× 1672 vs 1259. A model nobody can
  load is worth nothing, so the number is parked, not acted on. **Checking that code
  is committed and deployed is NOT checking that it works** — the decoder line was
  both, and was inert.
- **A CLO export names the MATERIAL and leaves EVERY TEXTURE ANONYMOUS.** Measured
  2026-08-21: **0 of 24 textures had a name or URI**, while materials were called
  `White Black Bold Minimalist Clothing Label_9946645`, `Material_Graphic`,
  `RUN LOGO`. **Any name-based artwork check that reads only the texture is silently
  inert on a real file** — it does not fail, it just never matches. This bit twice in
  one session: a first fix for the mirrored label below did nothing at all, and
  `variant-colour.ts`'s `isGarmentFabric` (texture-name only) let the halftone print
  win on surface area and named every colourway from its dark ink —
  Wine/Slate/Lilac became Brown/Sage/Denim, the same failure as 2026-08-03. Both now
  read the material name too. ⚠️ `variant-colour.ts` keeps its OWN word list on
  purpose; do not merge it with `texture-artwork.ts`'s. And use a token-boundary
  pattern, not the texture regex — that one contains `text`/`type`, so `Textile_Cotton`
  and `Polyester_Textured` classify as artwork and would exempt real FABRIC from
  double-siding.
- **`solidifyMaterials` forced EVERY non-`MASK` material double-sided, and that put a
  MIRRORED care label on the OUTSIDE of the garment.** The label is authored INSIDE
  and single-sided, so backface culling correctly hid it; double-siding rendered its
  reverse face through the fabric with the text reversed. The `MASK` exemption existed
  because "a printed decal" should keep its front — this label is a printed decal that
  landed on `BLEND` and so missed it. Judge on what the texture IS, not which
  alphaMode it reached. ⚠️ **Found by the OWNER looking at the rendered garment**; no
  gate saw it, and it had been latent since long before. It only fires on a garment
  whose artwork carries enough soft edge to miss the cutout test — N001's live model
  has 0 BLEND materials and is unaffected, so do not assume a past model needs
  re-running without measuring it.
- **Normal/ORM maps ran at COLOUR-map resolution and outweighed the artwork.** They
  were **9.63 MB against the artwork's 7.03 MB** of a 16.65 MB texture budget.
  `--data-max-texture` (half `--max-texture`) is invisible and saves 5.5 MB.
  **Quartering was tried and REFUSED**: 1.67% of pixels moved by >8/255 and it
  visibly flattens the white fabric's weave, for one more megabyte.
- **An all-over print on `BLEND` is classified as sheer FABRIC and takes the 2048
  cap.** The Cycling-Bib halftone is 4952×7014 and got squashed to 1446×2048 (0.29×),
  turning round dots into blocky squares. **`--max-texture 4096` is the safe lever.**
  Do NOT instead widen `isArtworkTexture` — `character` feeds it into
  `findArtworkAlphaProblems`, which **throws and saves nothing**, so widening it
  widens a *blocking* gate.
- **KTX2 came out SMALLER here (20.3 MB vs 22.2 MB) and must still be REFUSED.**
  ETC1S turned the clean white bib panel **grey and blotchy**; the letters survived,
  the fabric did not. Caught only by cropping the same region from both renders.
  Note this inverts the older "KTX2 is larger on disk" reasoning — that argument
  would have led the wrong way on this file. Judge it on the fabric, not the size.

## What one session found on 2026-08-27 — the rules that survived it

*The full record, with every measurement, is `docs/SESSION-2026-08-27.md`. What is here
is only what still tells you what to DO.*

**COMPARE THE ARTIFACTS, NOT A PICTURE OF THE DIFFERENCE.** A rendered diff shows what
CHANGED, never whether it got WORSE. A macro crop "proved" reduced texture settings had
damaged a slogan; `pipeline textures` settled it in one line — the artwork was
byte-identical at both settings and only the fabric atlas had shrunk. The letterforms
showed up because the CLOTH around each stroke changed and outlined them. Two wrong
conclusions and an hour.

**Artwork is separated from fabric by UV SPAN, not by name** (`artwork-geometry.ts`).
Measured over every textured primitive in 28 exports: fabric median **294.81**, topstitch
0.83, artwork **1.00**. Names cannot do it — real artwork materials are called
`ZZ00000ZZZZ0`, `ZZZ00000`, `76197`, `01`, `Untitled-1` and `ルン ろご。`, and 8 garments
match none of the nine English words.

**⛔ THE KHRONOS VALIDATOR DOES NOT CATCH A SOURCE-LESS TEXTURE.** `texture.source` is
OPTIONAL per the spec, so it is valid glTF (ARISAN: 0 errors, 0 warnings) and
gltf-transform is merely stricter. Anyone adding the validator to name that failure will
find it silent.

**A WebP image without `EXT_texture_webp` declared is INVALID glTF, and
`<model-viewer>` renders it anyway** — which is why every gate stayed green while every
processed garment was invalid (p001 44 errors, n001 42). Declared in
`texture-artwork.ts`, pinned by a negative-control test that strips it back out.

**`prune()` RENUMBERS UV SETS AND UPDATES ONLY THE DEFAULT MATERIAL.** Anything reachable
solely through `KHR_materials_variants` keeps sampling a `TEXCOORD_n` that no longer
exists. `variant-texcoord.ts` repoints them immediately after prune. **LATENT** — no real
garment samples a texCoord other than 0; it surfaces only because `placeholders.ts`
deliberately puts artwork on a second UV set. **Keep that fixture detail**, it is the only
thing exercising the path.
⚠️ **When a pass touches materials, ask what it does with the ones behind a variant.**
That was missed twice in one day — here, and in the viewer's decal depth bias at 6 of 26
decals.

**`repair-dead-textures.ts` removes the REFERENCES, never the entries.** Deleting
`textures[5]` renumbers every later index and a material pointing at 6 silently acquires
the picture from 7. It also pads the JSON chunk back to its original byte length so the
BIN chunk cannot move.

**The spec check is a PRODUCTION dependency and must NOT go inside `describeGlb`.** The
container installs `npm ci --omit=dev`, so a devDependency resolves locally and is missing
in the Container — green everywhere, failing at runtime. And it costs **~3.4x the file
size** in RSS (573 MB → 1,955 MB), while `describeGlb` reads only the JSON chunk, so the
1.25 GB Cycling Bib costs what a 5 MB one costs. `SPEC_MAX_BYTES` is 768 MB and the two
exports over it are **skipped by name** — a skip must never read as a pass.

⚠️ **`pnpm eval:artwork` PASSES ON macOS — this said the opposite until 2026-08-29.**
The old wording: *"FAILS ON macOS AND PASSES IN CI. Local 15.290 / 16.070 / 18.760
against a 5.000% ceiling."* **Re-run 2026-08-29 on this machine: 1.680 / 3.100 / 9.390
with the control at 3.0x the shipped preset — a clean pass**, matching what the
2026-08-28 audit independently measured. A commit between those dates fixed the
baseline (`c405537`, "give eval:artwork the same baseline its optimized runs get").
**So do NOT dismiss a local failure as a platform artefact** — that is what this note
told you to do, and it would now hide a real regression. If it fails locally, treat it
as a failure. CI runs it inside `mcr.microsoft.com/playwright:v1.62.1-noble`, and
**do not raise the ceiling to make anything green** — that part always held.

⚠️ **`review-server.ts` and `apps/viewer` are DIFFERENT PAGES.** A fix in one is not in the
other; the review viewer kept flickering after the product was fixed, which read as "the
fix did not work". Both carry the bias at `-8/-8`, pinned by `review-server.test.ts`.
⚠️ **A `git add -A` swept this file's constant into a viewer commit**, so reverting that
commit silently reverted the pipeline too. Stage per package when two copies must agree.

**`createTransform` is exported from `@gltf-transform/functions`, NOT `@gltf-transform/core`.**

## The print takes the CLOTH'S colour — OPEN, and NOT the flicker

Found 2026-08-28. glTF renders base-colour TEXTURE x FACTOR; these artwork textures are
near-white stencils, so the FACTOR is the ink — and CLO writes the colourway's
**fabric** colour into it. Minecut's slogan: rgb(246) x 0.13 = rgb(33). **13 of 16
garments**, `n001` included. **It is in the RAW export** — CLO's, not ours. **The depth
bias cannot touch it** (0 vs `-8` moves 0.000%).
⚠️ **Two fixes were tried and BOTH are wrong**, so do not re-apply either: whitening
every cut-out turns d001's dark olive graphic white, and whitening only prints matching
a cloth colour was **reverted (`447d15f`)** after it painted Minecut's correctly-dark
slogan white-on-white. Judge a print against the cloth **it sits on** — model-viewer
has no adjacency, this package does. ⚠️ **Read variants off the PRIMITIVES**:
`root.getExtension(...)` returns nothing and reads as "no colourways", false for all
16. All of it, incl. two non-causes: `docs/SESSION-2026-08-28.md`.
