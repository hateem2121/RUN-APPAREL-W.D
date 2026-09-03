# 3D pipeline investigation — 1–2 September 2026

> **STATUS: COMPLETE, report only.** No repository code was changed by this
> investigation. This file is the index; the full report, the evidence and the
> reproduction scripts live in `investigation/`, which sits outside this
> directory deliberately — the report cites render paths under the gitignored
> output directory, and `scripts/doc-citations.mjs` would fail on them in a clean
> checkout.

The whole pipeline was examined end to end: the CLO export, ingest, the queue,
the shrink Worker, the container, `tools/asset-pipeline`, delivery, and the
viewer a customer actually uses.

## What it found

80 findings were judged. **68 confirmed, 4 probable, 0 refuted outright, 8
dropped as out of scope.** Separately, **80 claims in this repository's own
instruction files were re-run and found wrong or stale.**

By severity: 8 broken, 21 damaging, 29 wasteful, 14 informational.

**The headline.** Two of the five production-ready garments cannot be published.
`findArtworkAlphaProblems` refuses them over a 236×39 topstitch texture whose
aspect ratio (6.05) trips `ARTWORK_ASPECT_RATIO` in
`tools/asset-pipeline/src/texture-artwork.ts` before the alpha-character test —
which reads it correctly as `graded`, i.e. not a decal — is ever reached. The
refusal message tells the owner to re-export their artwork while naming a
topstitch material. Re-exporting cannot clear it: the owner's own CLO re-export
removed the thread *geometry* and the gate reads texture *shape*.

Negative control, from the same measurement: Minecut Motion's topstitch texture
is 983×1642 (aspect 1.67), is not classified as artwork, and publishes fine.

## Method

Every finding carries the command that produced it and that command's output.
Each was then attacked by three independent checkers with different briefs —
does it reproduce, is the measuring instrument honest, and is it in scope — and
kept only if none of them could disprove it. Measuring harnesses were themselves
audited first, by introducing a defect and confirming the harness noticed;
`tools/asset-pipeline/src/render.ts` was found partly blind and its findings were
corroborated by other means.

## Where everything is

| What | Where |
|---|---|
| Full report | `investigation/REPORT.md` |
| Issue cards, diagrams, gaps (separately) | `investigation/report-cards.md`, `investigation/report-visuals.md`, `investigation/report-gaps.md` |
| Findings with evidence, per phase | `investigation/findings/` |
| Refutation verdicts | `investigation/findings/phase4-verdicts-MERGED.json` |
| Corrected instruction-file claims | `investigation/prior-corrected-claims.json` |
| Reproduction scripts written by the checkers | `investigation/refute-scripts/` |
| Run state and handoff | `investigation/STATE.json`, `investigation/RESUME.md` |
| Renders and per-garment measurements | gitignored, under the output directory |

## What this does not settle

The report has its own gaps section — read it before acting. In short: the run
was interrupted twice by usage limits and its scope was narrowed partway
through, whether a printed logo *should* stand out is a per-garment judgement the
owner has not yet made, and the ten older raw exports were deliberately dropped
from scope and are not covered.
