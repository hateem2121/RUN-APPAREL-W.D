# CLAUDE.md — the GLB pipeline

🔴 = stops here, do not proceed. 🟡 = read before acting. 🟢 = context.

Moved out of the repo-root `CLAUDE.md` on 2026-08-12 by `/doctor`, for the same
reason the viewer traps moved to `apps/viewer/CLAUDE.md` on 2026-08-10: the root
file is loaded into *every* session in this repo, and this section is only ever
needed by a session that is actually touching the pipeline. It loads
automatically the moment you touch `tools/asset-pipeline/`. Paths below are
repo-root-relative, as they were before the move.

The pipeline 🟡 **traps** moved here on 2026-08-19 and on again, word for word, on 2026-09-26
into three path rules (index at the bottom) that load with the files they govern — and,
unlike this file, also when `packages/shared/src/shrink.ts` sets the robot's flags. The root
`CLAUDE.md` keeps the one trap that must fire before you get here at all (**never run the
pipeline on its own output**). Read this file, then the rule for what you are changing.

## 🟡 `output/` is scratch — never judge a garment from it

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
uptime job is why `.github/CLAUDE.md` has CI check models with `HEAD` (weight, not an
R2 bill — R2 egress is free).

🟡 **For a material/alphaMode census you do NOT need the file — RANGE-FETCH the header.**
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

🟡 Do not tune presets against file size. That is exactly how a setting that
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

🟡 **THE RAW EXPORT IS NOT A DURABLE ARTIFACT AND MAY ALREADY BE GONE.** The
ingest bucket carries an `expire-raw-uploads` lifecycle rule — 14 days, **all
prefixes** — so the N001 export (uploaded on/before 2026-08-05) expires around
🟡 **2026-08-19**. `scripts/backup-r2.mjs` mirrors the *media* bucket and the two
apex PDFs, never *ingest*, so the ingest bucket is in no backup. The canonical copy is therefore a **local** one,
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

🟡 **The R2 key contains SPACES.** It is `cycling all colours.glb`, not the
hyphenated `cycling-all-colours.glb` that everyone types from memory. The hyphenated form is the *local*
filename, deliberately renamed on download so nothing downstream deals with spaces
in a path; it is not the key. Quote it, or an unquoted expansion splits it into
three arguments and wrangler reports a confusing bucket error.

🟡 Both take `--calibrate` to print the damage curve and `--keep <dir>` for the
contact sheets. Both assert a **negative control**: if switching `--uv-weight` off
stops registering as damage, the eval says it has gone blind and fails rather than
passing quietly. **Do not raise either ceiling to make it green.**

🟡 **`eval:artwork:real` also refuses to run if its camera is not pointed at the
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
| 🟡 A print piece was decimated — never, since 2026-09-02; the assertion names any that moved | `simplify-textured.ts` → `artworkAtRisk` |
| A hard-edged, opaque print is STILL `BLEND` (the opaque step would have changed it) | `texture-artwork.ts` → `auditArtworkAlpha` |
| An artwork `MASK` has an `alphaCutoff` other than 0.5 | same |

🟡 All three are *structural* — a stated fact about the output file, with no
false-positive case — which is why they block. 🟡 **Until 2026-09-02 the second row
refused two finished garments over THREAD**: the generous classifier read CLO's 236x39
topstitch strip as a wordmark by SHAPE, before its soft alpha (F2-01, B-03, CT-06). The
gate now has its own strict classifier (`classifyArtworkForGate`: material name or
binary alpha, never a `NOT_ARTWORK_NAME`, shape alone never) and asks
`resolveBlendAlpha` — solidify's own decision — whether a BLEND material should have
changed; soft or translucent prints are reported (`artworkSoftOnBlend`), never refused. The bytes-per-pixel measurement
(`findCrushedArtwork`) only **warns**, because a legitimately flat label encodes
just as small as a smashed wordmark, and a gate the owner learns to override is
worse than no gate. Keep that distinction if you add checks.

## A scratch script cannot import this package's dependencies

ESM resolves a bare specifier from the **importing file's** location, so a one-off script
in `/tmp` cannot `import { NodeIO } from '@gltf-transform/core'`, and `NODE_PATH` does not
apply to ESM. Put the script under
`tools/asset-pipeline/scripts/` as a `.mts` (as `strip-live-r2.mts` is), or
run from the package directory, where cwd is the resolution base:

```bash
cd tools/asset-pipeline && node --input-type=module -e "import {NodeIO} from '@gltf-transform/core'; …"
```

## A mistyped numeric flag used to become `NaN` — fixed 2026-08-18, keep it fixed

🟢 `Number('0.OO1')` is `NaN`, and `NaN ?? DEFAULT` is still `NaN` (`??` tests null, not
NaN), so a mistyped `--simplify-error` or `--uv-weight` reached the simplifier as an
undefined value on the axis that decides whether printed letters survive. Every numeric
flag now goes through `finiteNumber` in `optimize.ts`, which refuses a missing or
non-numeric value loudly — add a flag, use it. Production never saw this: the container's
flags are literals from `shrinkFlagsFor` (`packages/shared/src/shrink.ts`).

## Where the pipeline's traps live

| Rule in `.claude/rules/` | Traps | What it covers |
|---|---|---|
| `pipeline-materials.md` | 9 | alpha modes, cut-outs, texture sizes, colour names, the print's ink colour |
| `pipeline-geometry.md` | 8 | decimation, thread, UV remap, compression, the robot's flags, CLO 7 exports |
| `pipeline-evals.md` | 7 | `eval:artwork`, rendering and cameras, the review server |

The npm lockfile beside this file is in `.claude/rules/shrink-container.md`. **Working
through Bash? `cat` the rule before changing anything it covers** — rules load on the Read
tool only (`docs/CLAUDE-MD-MAINTENANCE.md`). 🟢 After `/compact` only the root `CLAUDE.md`
comes back; `recall-nested-instructions.mjs` names this file and every rule, but loads none
of them, so reopen the rule for what you are changing.
