# Continue the 3D garment forensic investigation (local session)

Paste everything below into a new Claude Code session opened in the repo folder on the Mac.

---

You are continuing a READ-ONLY forensic investigation of the RUN APPAREL 3D garment pipeline
(repo `hateem2121/RUN-APPAREL-W.D`). A cloud session on 2026-09-27 did everything it could
without the raw CLO exports. This local session has them. Finish the rest.

## Start here

1. Everything the cloud session produced is on GitHub branch **`claude/festive-shannon-akia45`**
   (a draft pull request), in the folder **`docs/3d-viewer-forensics-2026-09-27/`**. It holds the
   written report (`README.md`), the interactive report page (`report.html`), evidence pictures,
   measurements (`data/`) and the exact test scripts (`scripts/`).
   Fetch and read it first: `git fetch origin claude/festive-shannon-akia45`, then read the
   files with `git show origin/claude/festive-shannon-akia45:<path>`, or check the branch out
   if my working tree is clean. Ask me if it is not.
2. The same report is also a private artifact: https://claude.ai/artifact/4EFMxMgcsweeWvgArksGTx
3. **My garment files are in `/Users/hateemjamshaid/Documents/3D Catalouge Products`.**
   - The **GLB files there are zipped.** Never unzip, rename, move or edit anything in that
     folder. Copy a zip to a scratch folder OUTSIDE the repo and unzip the copy there.
   - The **PNG images there are renders made in CLO 3D.** They show how each garment SHOULD look,
     so they are the "correct answer" for every comparison. Match the viewer's camera angle to
     each PNG as closely as you can before comparing.
   - If a zip or PNG does not clearly match one live garment, ask me which is which.

## Hard rules (do not break these)

1. **Investigate and report only.** Do not edit, refactor or open PRs. If you find a fix,
   describe it; do not implement it. Experiments happen only in the browser console, or in a
   scratch copy OUTSIDE the repo, and are thrown away afterwards.
2. **No commits unless I say yes in this session.** If I do, commit only to branch
   `claude/festive-shannon-akia45`, inside `docs/3d-viewer-forensics-2026-09-27/`, then push once
   and wait for CI (root CLAUDE.md: a second push cancels the running CI).
3. **The repo is public.** Never commit raw CLO files, the product PNGs, secrets or PDF link codes.
   Ask me before committing any picture made from my files.
4. **Never delete, move or overwrite my files.** The raw CLO exports are the only copy.
5. **Never run the pipeline on its own output.** Always start from the raw CLO export. A hook
   refuses the other way round; do not work around it.
6. **Database is read-only.** Use only SELECT queries through the Cloudflare MCP tool
   `d1_database_query` (database id 41e20361-1a5f-4c87-b5ca-781c57c9b3f4), and check that every
   response reports that the database was not changed.
7. `pnpm` means `npx --yes pnpm@12.6.0` (see the root CLAUDE.md "pnpm note").
8. Read the root `CLAUDE.md`, `tools/asset-pipeline/CLAUDE.md` and `apps/viewer/CLAUDE.md` first.
   Open files with the Read tool so the matching path rules load.
9. **Never assume. If you are unsure about anything, ask me one clear question.**
10. Before anything long, costly or irreversible, tell me first.

## How to talk to me

I am not technical. Write like you're explaining to a smart 10-year-old: short sentences, plain
words, one simple analogy where it helps. Every claim still carries its evidence (file and line,
a measured number, or a picture). Label each conclusion ✅ VERIFIED / 🔍 LIKELY / ❓ GUESS, with a
confidence %, and say "the one test that would prove it". Give me short progress updates.

## What is already PROVEN (do not redo; build on it)

See `docs/3d-viewer-forensics-2026-09-27/README.md` on the branch for the full evidence.
In short:

1. **Parts invisible when zoomed out = the anti-flicker "nudge" over-reaching.**
   - `apps/viewer/src/lib/decal-depth-bias.ts` sets polygon offset factor and units to -8 on
     cut-outs and on layers the pipeline marked (`tools/asset-pipeline/src/overlay-annotate.ts`).
   - The factor part scales with screen-pixel slope. So when zoomed out, a nudged layer jumps in
     front of a layer that really sits on top of it.
   - **Minecut Motion:** the marble print hides the "EXTRA" waistband from every angle, in every
     colour, on desktop and on a phone-sized screen.
   - **Classic Soccer Shirt:** the pink print pushes through the collar.
   - **Geovent Tennis Dress:** the nudge HELPS. The other 13 garments show no visible harm.
   - The nudge is still needed (without it the skirt edges speckle), so a fix must weaken it,
     not remove it.
2. **Blinking:**
   - X-Milo Pro Bib: cut-out side-panel print (alpha-to-coverage cuts it 91%).
   - Classic Soccer Shirt: knit normal map (off cuts it 95%).
   - Armor-Tech Jacket: see-through topstitch strips.
   - Women Zip-Up Vest: topstitch plus cut-out edges.
   - Every other garment is under 0.2%.
3. **Blend prints look solid.** The shrink reports show CLO exporting almost every print at 100%
   opacity. glTF has no blend mode beyond "over". The pipeline rule is in
   `tools/asset-pipeline/src/textures.ts`.
4. **Low quality.** File size is not the limit (1.8–7.8 MB against a 40 MB ceiling). Prints were
   shrunk to the 4096 cap on 9 of 14 garments. Phone graphics memory reaches 224 MB (the iPhone
   limit is about 256). No gate judges the picture.
5. Armor-Tech zipper teeth at 0% strength are intentional (an invisible zipper).

The cloud session's method is in the branch's `scripts/` folder and described in its README:
Playwright on the live pages, reaching the three.js scene through model-viewer, toggling one
setting at a time, a "blink" metric, and a reference rendered 4× sharper WITH THE NUDGE OFF.
**Now the CLO PNG renders are a better reference.** Use them.

## What is LEFT to do (in this order)

**0. Ask me for:**
- the 2–3 garments that look worst to me;
- one "blend" print: garment, print name, and a screenshot of its CLO graphic settings.

**1. Minecut and Soccer Shirt at file level.**
- From an unzipped copy of the raw export, run `pnpm pipeline overlays <file>.glb --json`.
  Also run it on the shipped file from media.wear-run.help.
- Name exactly which layer sits on top of the nudged `Material_Graphic` (the waistband / the
  collar), its gap in mm and its confidence, and the layers "held for review".
- Explain why the detector flagged a panel that another layer covers.

**2. Raw vs shipped vs CLO render, garment by garment.**
- For my worst garments, and ideally all 16, compare the CLO PNG render, the raw export and the
  shipped file.
- Use the repo's tools (`pnpm pipeline describe`, `pnpm pipeline textures`, `pnpm pipeline render`
  or the review server with production lighting). Judge prints with 4–7° close-ups, per
  `tools/asset-pipeline/CLAUDE.md`.
- Find what got worse: print resolution, weave map size, colour, gloss, geometry, or missing
  parts. Show before/after crops.

**3. The blend print, end to end.**
- CLO render PNG → raw export (alpha mode, base colour alpha, the texture's alpha profile,
  normal map) → shipped file → live viewer.
- Say exactly where the effect is lost, and whether any CLO export option keeps it.

**4. Real iOS check.**
- The repo notes an iOS simulator on this Mac. Open Minecut (waistband) and X-Milo Pro Bib
  (shimmer) in real iOS Safari WebGL.
- Confirm or deny the desktop findings. Use real touch, not synthetic pointer events
  (see `apps/viewer/CLAUDE.md`).

**5. Test candidate fixes as experiments only.** Measure each against the CLO render and the
blink metric:
- a smaller or distance-scaled polygon offset factor for the marked solid layers;
- alpha-to-coverage on cut-out materials for all 16 garments;
- sparkle mitigation for normal-mapped fabric;
- a steadier material for see-through topstitch.

Report which work, with numbers and pictures. Do not implement them in the repo.

**6. Apex Flex Pullover and Capsule Core Hoodie** have no shrink report in the database. Find how
they were processed, and check their settings the same way.

## What to hand back

A plain-English update with numbers and before/after pictures:
- a one-line verdict per remaining question;
- a refreshed severity ranking;
- an updated checklist.

Then ask me:
- whether to republish the report artifact above with the new findings;
- whether to commit the new findings to branch `claude/festive-shannon-akia45`.
