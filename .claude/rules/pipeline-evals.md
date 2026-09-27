---
paths:
  - "tools/asset-pipeline/src/render.ts"
  - "tools/asset-pipeline/src/compare.ts"
  - "tools/asset-pipeline/src/viewer-page.ts"
  - "tools/asset-pipeline/src/review-server.ts"
  - "tools/asset-pipeline/src/posters.ts"
  - "tools/asset-pipeline/src/instruments*.ts"
  - "tools/asset-pipeline/scripts/**"
  - "raw/**"
---

# The pipeline: artwork evals, rendering and the review server

Moved from `tools/asset-pipeline/CLAUDE.md` on 2026-09-26, word for word. **Read
`tools/asset-pipeline/CLAUDE.md` too**: before any preset, threshold or export change, the
rendered print is the only judge (its "Before you change the pipeline").

## Traps

- **🟡 `model-viewer.toDataURL()` returns a blank canvas** —
  `preserveDrawingBuffer: false`. Screenshot the element.
  🟡 **`toBlob()` IS DIFFERENT AND IS ALSO NOT A MEASURING TOOL.** Measured
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
- **🟡 `fieldOfView` under 12° was silently ignored until 2026-08-08 — the SECOND
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
  🟡 **`--find-views` proposes the zoom that frames the PRIMITIVE**, which on the
  neck logo sliced "RUN" off the bottom edge — the print is two elements and the
  primitive covers one — so the shipped view is one rung wider than proposed, and
  that is visible only in the PNG, never in the number. The camera-fingerprint
  guard **used to refuse `--calibrate` itself**, blocking the one command its own
  error message prescribed and leaving "hand-edit the fingerprint to a value you
  have not measured" as the only way out; it is now exempt there, with a loud
  notice. And `--keep` resolves against the CWD, which `pnpm` sets to
  `tools/asset-pipeline/`, so artifact paths are now printed **absolute** — the
  RUNBOOK's repo-relative one did not exist.
  🟡 That calibration was measured on a **busy** machine (the wordmark column came
  back 0.490/2.510/5.290/5.330, an exact match to the busy set recorded above).
  Busy runs read ~0.48pp LOW, so the ceiling is tighter than intended rather than
  looser, and the offset was added back explicitly when choosing 6.5%. Re-run idle
  and append a remeasurement when convenient; **do not lower the ceiling to match
  an idle run's higher `balanced`.**
- **🟡 `pnpm eval:artwork:real -- raw/x.glb` did not resolve that path.** `pnpm`
  forwards the `--` separator itself into `process.argv`, and the root script
  delegates via `pnpm --filter`, which runs the child with cwd set to
  `tools/asset-pipeline/` — so a repo-relative path documented in the RUNBOOK
  resolved under the package and step 3 of a five-step procedure failed for anyone
  who copied it verbatim. Relative paths now fall back to the repo root. The lesson
  is the cheap one: **run the documented command, do not read it.**
- **🟡 A flat frame scores 0.00% against another flat frame.** 2026-09-02: three
  ARISAN macro crops matched their control PERFECTLY because all three were grey —
  the near-plane getter is read only when three rebuilds the projection, which
  model-viewer does on a FOV change and never on a radius-only move, so a 2.2 m view
  followed by a 0.6 m view kept the far plane and clipped the garment.
  `viewer-page.ts` refreshes the projection on every `camera-change`, `render`
  names any flat view (`flatViews`, 🟡 FLAT in the CLI), and
  `instruments.browser.test.ts` drives the sequence both ways. Treat a 0.00% on a
  crop as "look at the picture", never as a pass.
  🟡 **Closed for N001 by `pnpm eval:artwork:real`**, the same method on the actual
  382 MB export — **manual and local** (why: "Before you change the pipeline"). Its
  ceilings and camera fingerprints live in `raw/CANONICAL.json`, recalibrated on the
  truthful harness on 2026-09-02 (C-02). 🟡 **RUN IT ON AN IDLE MACHINE**: with a
  test suite alongside every case read a *uniform* ~0.48pp low (2026-08-07, three
  idle runs identical to three decimals) — the baseline render, not decimation.
  🟡 **Do not "fix" a small absolute difference; re-run idle first.**
  🟡 **The sweep is NOT the authority on a real garment.**
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
- **A backtick inside `review-server.ts`'s page script ENDS the template literal**, and
  the error names something else (`TypeError: escapeHtml(...)…camera is not a function` —
  the whole template stringified). Cost two cycles on 2026-08-29. The page script must
  contain **zero** backticks.
- **`pipeline review <dir>` resolves `<dir>` against the PACKAGE dir and indexes ONCE
  at startup** — a relative path is read from `tools/asset-pipeline/`, and files added
  after start report "0 garment(s)": restart it.

## From the 2026-08-27 session

*Full record: `docs/archive/sessions/SESSION-2026-08-27.md`. Here is only what tells you what to DO.*

🟡 **COMPARE THE ARTIFACTS, NOT A PICTURE OF THE DIFFERENCE.** A rendered diff shows what
CHANGED, never whether it got WORSE: a macro crop "proved" reduced texture settings had
damaged a slogan, and `pipeline textures` showed the artwork byte-identical — only the
fabric atlas had shrunk, and the changed CLOTH outlined each stroke. Two wrong conclusions
and an hour.

🟡 **`pnpm eval:artwork` PASSES ON macOS.** Measured 2026-08-29 on this machine:
**fidelity 1.680 / balanced 3.100 against the 5.000% ceiling, and CONTROL 9.390 — 3.0x
the shipped preset, above the ceiling as a negative control must be: a clean pass**,
matching the 2026-08-28 audit; `c405537` ("give eval:artwork the same baseline its
optimized runs get") fixed the baseline. 🟡 **So do NOT dismiss a local failure as a
platform artefact** — it would hide a real regression. CI runs it inside the
`mcr.microsoft.com/playwright` image matching `@playwright/test`, and 🟡 **do not raise the ceiling to make
anything green.**

🟡 **`review-server.ts` and `apps/viewer` are DIFFERENT PAGES.** A fix in one is not in the
other; the review viewer kept flickering after the product was fixed, which read as "the
fix did not work". Both carry the bias at `-8/-8`, pinned by `review-server.test.ts`.
🟡 **A `git add -A` once swept this file's constant into a viewer commit**; stage per
package when two copies must agree.
