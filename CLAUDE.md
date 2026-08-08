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

**`pnpm` is not on `PATH` on the owner's machine — use `npx --yes pnpm@10.33.0`.**
Every documented `pnpm <script>` in this repo means that. Bare `pnpm` fails with
exit **127**, and the failure is worth naming because of *where* it surfaces:
`apps/viewer/e2e/prepare.mjs` shells out to `pnpm build`, so the whole e2e suite
dies as `Timed out waiting 120000ms from config.webServer` with the real
`status: 127` buried inside a child process. `.claude/settings.json` and
`.claude/launch.json` already use the `npx` form; this line is why.

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
- **`pnpm eval:artwork:real -- raw/x.glb` did not resolve that path.** `pnpm`
  forwards the `--` separator itself into `process.argv`, and the root script
  delegates via `pnpm --filter`, which runs the child with cwd set to
  `tools/asset-pipeline/` — so a repo-relative path documented in the RUNBOOK
  resolved under the package and step 3 of a five-step procedure failed for anyone
  who copied it verbatim. Relative paths now fall back to the repo root. The lesson
  is the cheap one: **run the documented command, do not read it.**
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
- **The three blocking gates do NOT catch decimation damage.** They test
  `alphaMode`, which decimation does not change. A six-run sweep from the raw
  N001 export (`scripts/sweep-size-vs-artwork.mjs`, 2026-08-05) rendered the chest
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
- **A grid item's `min-height: auto` silently beats `max-height: 100%`.** The
  loading poster overflowed its stage by 926px for months this way — measured
  498×1500 inside 546×574 — and looked like the image was *tiling*, because the
  overflow was clipped by the sections above and below. `max-width` alone still
  left it at 623px. `min-height: 0` is the line that actually fixes it. Same trap
  as the familiar `min-width: 0` on flex children.

- **The CSP violation on every page load is Bot Fight Mode, NOT Web Analytics.**
  On 2026-08-05 it was diagnosed as Web Analytics' "Automatic Setup" injecting a
  beacon bootstrap, and that is **wrong** — corrected 2026-08-06 by reading the
  injected script instead of inferring it. It is Cloudflare's **JavaScript
  Detections** (`window.__CF$cv$params`, loading
  `/cdn-cgi/challenge-platform/scripts/jsd/main.js`), which is bundled with Bot
  Fight Mode and, per Cloudflare's docs, *"automatically enabled and cannot be
  disabled"* for Bot Fight Mode customers. Web Analytics was never involved: the
  delivered HTML had **zero** matches for `cloudflareinsights`, and a live load made
  **zero** requests to it.
  **No hash can ever cover it.** The script embeds a per-request ray id and
  timestamp, so its sha256 differs on every single load — measured three values in
  under a minute (`YQqe7Ux…`, `jgl9AA6h…`, `eXCOhXoR…`). Anyone "fixing" this by
  pinning a hash is chasing a value that changed before they pasted it.
  **RESOLVED 2026-08-06 — and the fix is not in the dashboard.** Turning Bot Fight
  Mode off is NOT sufficient: `enable_js` is a **separate zone flag that does not
  clear with it**, and the Free plan renders it as read-only status text
  ("JS Detections: On", tooltip "enabled by default when you turn on Bot fight
  mode") with no control. Verified via the API — `fight_mode: false` and
  `enable_js: true` at the same time.
  Fix, from an authenticated dashboard session:
  ```js
  // GET first; PUT REPLACES the config, so echo every field back.
  // PATCH returns 405 — this endpoint is PUT-only.
  const cur = (await (await fetch(`/api/v4/zones/${ZONE}/bot_management`,
    {credentials:'include'})).json()).result
  const body = {...cur, enable_js: false}; delete body.using_latest_model
  await fetch(`/api/v4/zones/${ZONE}/bot_management`,
    {method:'PUT', credentials:'include',
     headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
  ```
  Zone `wear-run.help` = `805d8ae5fa0dea40c960a2561f66d141`. Injection stopped
  immediately; the page now serves ONE inline script (our theme bootstrap) and logs
  no CSP error.
  Two rejected alternatives, for the record:
  - **`Cache-Control: no-transform` on the HTML** — documented to stop the
    injection, but it cannot be delivered to the SPA routes from `_headers` on this
    deployment. Tried and measured; see the `_headers` trap below.
  - **CSP nonces** — Cloudflare adds matching nonces to what it injects, by parsing
    your CSP response header. Not usable from a static `_headers` file: a nonce must
    be per-request, so it would need the viewer Worker to rewrite the header per
    response. Nonces set via `<meta>` are explicitly unsupported.
  Never widen to `'unsafe-inline'`.

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

- **`_headers` DOES survive `env.ASSETS.fetch()` — measured 2026-08-08, so the
  viewer can grow a Worker without losing its CSP.** This was an open unknown
  blocking per-garment link previews: `apps/viewer/wrangler.jsonc` is assets-only,
  injecting per-garment OG tags needs a Worker, and Cloudflare's docs say only that
  `_headers` is "supported natively" — never what happens to a response the Worker
  fetched through the binding. If it were applied by the asset router *before* the
  binding, adding a Worker would silently drop CSP and HSTS on every page, and no
  test in this repo would catch it.
  Measured on wrangler 4.114.0, `compatibility_date` 2026-07-01, against a fixture
  carrying a deliberately non-default `X-Headers-Probe` (per the trap above — a
  default-shaped value proves nothing). On the SPA-fallback route `/n001/wine`,
  **all three** of assets-only, `return env.ASSETS.fetch(request)`, and
  `new Response(response.body, response)` returned identical CSP, HSTS and probe
  headers. A `/__worker-marker` route returned `X-Worker-Ran: yes` in the same run,
  so the Worker was genuinely in the path rather than bypassed — without that
  control the result would have been indistinguishable from the Worker never
  running. The same run also re-confirmed the combining rule above: a hashed asset
  came back with `x-headers-probe` **twice**, once per matching rule.
  ⚠️ Measured on `wrangler dev` (local), not against the edge. It exercises the
  same asset-serving implementation, but if a production deploy ever adds a Worker
  here, re-check the live response headers once rather than trusting this line.

- **A build-time CSP cannot cover an edge-injected script — by construction.**
  `scripts/csp.mjs` hashes the inline scripts present in the *built*
  `dist/index.html`; anything Cloudflare injects at the edge arrives after those
  hashes exist. This is why the beacon is embedded as a `<script src>` (no hash
  needed) rather than left to Automatic Setup. A manual embed POSTs to
  `cloudflareinsights.com` while automatic setup posts to your own origin, so those
  two `connect-src` entries are not interchangeable. The policy is a pure function
  in `scripts/csp.mjs` with tests; `gen-headers.mjs` is only the I/O around it.

- **A 404 from `media.wear-run.help` can be a CACHED 404 — and `HEAD` will not
  tell you.** It is an R2 custom domain with a 30-day edge Cache Rule, so a request
  for an object that does not exist *yet* caches the miss. On 2026-08-06 a model the
  shrink worker had just written returned `GET 404` (a 28 KB Cloudflare error page)
  while `HEAD` returned **200 with the correct `content-length`** — the two landed on
  different cache entries. The cached 404 was **25 hours old**, from a probe made
  before the file existed. The object was intact in R2 the whole time
  (`wrangler r2 object get` returned all 28,271,780 bytes) and the same URL with
  `?v=1` served 200 immediately.
  **So: after the shrink writes a model, fetch it the way a browser will — bare URL,
  plain GET — before pointing a product at it.** `artworkVerdict: ok`, the filesize,
  the `{OPAQUE, MASK}` census and a `HEAD` were *all green* while the file was
  unreachable; swapping `glbAsset` on those signals would have put a 404 on the live
  page. Fix is a **Custom Purge of that one URL**. Note `scripts/smoke-viewer-payload.mjs`
  deliberately uses `HEAD` to keep R2 egress off the $5/month cap, so it would **not**
  have caught this either.

- **Anything CI fetches from a `wear-run.help` host can 403 from a runner.**
  Free-plan Bot Fight Mode intermittently blocks datacenter traffic — it forced the
  `cms.wear-run.help` API cutover to be rolled back within the hour, and it later
  failed a deploy through a new post-deploy check that treated the 403 as "no
  model". Treat such a 403 as *inconclusive*, never as a failed assertion. And use
  `HEAD`: a `GET` on the model is 37.7 MB per run, which the 15-minute uptime job
  turns into gigabytes of R2 egress against a $5/month cap.

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
**Take a D1 backup and capture `GET /api/public/viewer/n001/wine` first** — that
before/after diff is what caught the last data-loss incident when the migration
logs said success. See `docs/BACKUP-RESTORE.md`.

## Style

Match the surrounding code: comments here explain *why*, usually citing the
incident that motivated them, and that convention is load-bearing — several of
the traps above are only discoverable from those comments. Prefer stating a
measurement over an adjective.
