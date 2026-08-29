# Prompt for the next session — paste this whole thing

Remember to never assume. Always ask if you have any questions, confusions or stuck
anywhere.

* Remember to always follow all the latest best practices. For it you can always
  research online for all the latest resources as of 27 August 2026.
* Never use sub agents, workflows, etc. They use too many tokens.

Also: I am non-technical — explain like I am a 5th grader, make the technical
decisions for me and tell me what you decided and why. Show me results in a live 3D
viewer, not still images. Branch before committing; never commit to `main`.
**Verify every claim by running it** — including claims in `CLAUDE.md`, in this
prompt, and in your own earlier messages. In the last session, *five* written claims
turned out false when executed.

---

## THE PROBLEM, IN MY WORDS

**The graphics still glitch and flicker.** I still see it. Do not treat the flicker
as fixed.

---

## START HERE — the leading hypothesis, already measured

```bash
git fetch && git checkout feat/garment-pipeline-defects
git log --oneline main..HEAD          # the work; `main` exists locally, this resolves
```

Then read, in this order: `CLAUDE.md` (root), `apps/viewer/CLAUDE.md`,
`tools/asset-pipeline/CLAUDE.md`. They hold the traps and the gate list, and three
claims in them were corrected on 2026-08-28 — so trust them more than this file, and
run anything either of us asserts.

**The fix exists but has NEVER REACHED ME.** Nothing was pushed, merged or deployed.
Run this — it is the whole diagnosis in four lines, and it needs no branch state:

```bash
curl -s https://viewer.wear-run.help/ -o /tmp/live.html
ASSET=$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' /tmp/live.html | head -1)
curl -s "https://viewer.wear-run.help$ASSET" | grep -c "variant-applied"
git log --oneline origin/main..HEAD | wc -l          # commits never merged
```

Measured 2026-08-28: **0** matches in the live bundle, 23 commits unmerged.
⚠️ **The 0 is the number that matters and the only one that cannot drift** — the
commit counts move every time anyone commits, including the commit that added this
file, which is exactly how the first draft of this table went stale within a minute.
Re-run rather than reading the figures.

So `viewer.wear-run.help` is running the OLD code and *must* still flicker. That is
the single most likely explanation and it is cheap to settle.

**⚠️ DO NOT STOP THERE.** "Not deployed" explains the live site. It does NOT explain
a flicker I might be seeing somewhere else. **Ask me which of these I am looking at**
before you plan anything:

1. the live site `viewer.wear-run.help`
2. the local review viewer (`pnpm pipeline review`)
3. a specific garment file, opened some other way

The answer changes the whole diagnosis. Last session an hour went into the wrong
garment because nobody asked.

---

## WHAT IS ALREADY MEASURED — do not re-derive this

**The mechanism (confirmed in a real browser, with a positive control).**
A printed graphic sits flush against the cloth, so the GPU cannot tell which is in
front and the winner changes per pixel and per frame. `polygonOffset` pulls the
graphic nearer and fixes it. Proof that the instrument works: at `+10000` the decals
vanish behind the garment entirely.

**Which garments are affected — the number that predicts it** is the decal-to-cloth
surface gap:

| garment | closest approach | rendered and judged? |
|---|---|---|
| `n001` / live `rxps` | 0.169 mm | **yes — clean.** Owner: "worked perfectly before as well" |
| `p001` (joggers, "NEVER LOOK BACK") | **0.001 mm** | **yes — print destroyed without the bias** |

⚠️ **Those are the only TWO garments actually rendered and compared, so there is no
measured threshold** — an earlier draft of this file said "under about 0.1 mm it
z-fights" and that was interpolation dressed as a measurement. Everything between
0.03 mm and 0.169 mm is untested. The gap is a useful way to RANK which garments to
look at first; it is not a rule, and it must not be used to declare a garment safe
without looking at it.

Other minima measured the same way, for ranking only: `t003` 0.101, `d002` 0.112,
`d001` 0.114, `arisan`/`capsule`/`kinetic` not yet measured.

**"Flicker" and "missing bits and pieces" are ONE bug.** A graphic that loses the
depth fight is covered by cloth in patches, which reads as ink that was never
printed. Do not chase them separately.

**Why the first fix was incomplete.** model-viewer builds only the *arriving*
colourway's materials; anything reachable solely through `KHR_materials_variants` is
a lazy stub with an empty backing set. The load-time-only fix reached **6 of 26**
decals, so four of five colourways kept flickering. `variant-applied` fires after the
swap resolves — re-applying there gives 26/26, verified live (11/11 → 16/16 → 21/21 →
26/26 as each colourway was visited).

---

## WHAT WAS DONE — all gates green except one (see Outstanding #3)

1. `fix(viewer)` — re-apply the depth bias on every colourway; split the silent
   failure counter using the public `isLoaded`; rebuilt the test fixture so it can
   actually exhibit the bug (it had 0 lazy decals against production's 20); e2e test
   with **both** negative controls verified.
2. `feat(pipeline)` — the six unreadable garments now process. ARISAN 47.8→3.8 MB,
   CAPSULE CORE 172.5→8.4, Minecut 92.1→6.5, STRUCTURE POLO 112.5→11.8, TERRA ACTIVE
   177.7→4.9, KINETIC SPLATTER 587.2→6.6.
3. `feat(pipeline)` — Khronos glTF-Validator on our own output. It found two real
   bugs: **every processed garment was invalid glTF** (WebP with no
   `EXT_texture_webp` declaration) and **`prune()` renumbers UV sets while updating
   only the DEFAULT material**, leaving colourway-only materials pointing at an
   attribute that no longer exists.
4. `docs(claude)` ×2 — findings recorded; three previously-written claims corrected;
   all CLAUDE.md files trimmed under the 40,000-character warning.

---

## OUTSTANDING — in the order I care about

### 1. Make the fix actually reach me
It is committed and not deployed. Decide with me whether to push, open a PR and
merge. **Before merging to `main`:** take a D1 backup and capture
`GET /api/public/viewer/rxps/wine` — see `docs/BACKUP-RESTORE.md` and
`.claude/skills/deploy-preflight/`. Then prove it live with the same
`grep -c "variant-applied"` check above, and by looking at a garment in a browser.

### 2. Then confirm on a garment I can see
If I still see flicker *after* it is deployed, the diagnosis is incomplete and you
should start again from reproduction — not from this prompt's assumptions.

### 3. `pnpm eval:artwork` FAILS locally and I do not know if that matters
Local 15.290 / 16.070 / 18.760 against a 5.000% ceiling — **byte-identical at three
different commits including before any of this work**, on the same Playwright 1.62.1
CI pins, while CI's `artwork` job is green on `main`. So it is deterministic,
pre-existing, and platform-dependent (CI runs it in
`mcr.microsoft.com/playwright:v1.62.1-noble`). **Do NOT raise the ceiling.** Decide
whether to reproduce it in that container or leave it to CI, and tell me which.

### 4. Things deliberately NOT done — reopen only with a reason
- **Task 12**, the file-side decal offset. The viewer fix covers every garment
  including already-published ones with nothing reprocessed, and the file-side
  version is the approach that once tore multi-panel prints along their seams.
- **`STRUCTURE POLO SET` must not be published** — it declares 5 colourways and binds
  none. Defect in the file; re-export from CLO is not available.
- **`TERRA ACTIVE ZIP` has 0 MASK decals and that is CORRECT** — its print is
  tone-on-tone sublimation. Checked in the viewer; it renders fine.

---

## HOW TO SEE ANY OF THIS, LIVE

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline start review \
  ~/Sites/Model-Viewer-main/output/repair-check \
  ~/Sites/Model-Viewer-main/output/production --port 4180
```

Open `http://127.0.0.1:4180`, pick **p001**, and use the **Decal depth bias On/Off**
toggle. Off shatters the print; On makes it solid. The 28 raw exports are at
`~/Documents/3D Products/` (7.7 GB, never committable).

⚠️ `review-server.ts` and `apps/viewer` are **different pages**. They now carry the
same bias, pinned equal by a drift test — keep it that way or the review viewer lies
about the product.

---

## TRAPS THAT COST TIME LAST SESSION

- **`pnpm` is not on `PATH`, and `/opt/homebrew/bin/pnpm` is a DANGLING SYMLINK** —
  `ls` and `command -v` both succeed, running it fails naming the symlink. Use
  `npx --yes pnpm@10.33.0`. When a child process needs a real one (`e2e/prepare.mjs`
  shells out to `pnpm build`), put a shim on `PATH` that execs it.
- **`toBlob()` reports 0 changed pixels even when the change is obvious** — a decal
  painted bright red diffed to zero while the visible canvas was plainly red.
  Screenshot the element, and **prove your instrument can see a change you introduce
  on purpose before believing a zero.**
- **model-viewer's camera reads the ATTRIBUTE** — setting `mv.cameraOrbit` silently
  did nothing, so a "grazing angle" comparison was two head-on frames. Use
  `setAttribute` + `await updateComplete`, then read `getCameraOrbit()` back.
- **A rendered difference image shows what CHANGED, not whether it got WORSE.**
- **The Browser pane goes hidden and throttles rAF**, so a model can take 20+ seconds
  to load and look stuck. Wait, don't diagnose.
- **zsh eats an unquoted `--include=*.ts`** in grep. Quote it.
- Playwright browsers are installed now; a missing one fails at **0 ms**, which reads
  as broken code.

---

## HOUSEKEEPING

The branch is clean: no uncommitted files, no stashes, one worktree (the checkout
itself) — nothing to tidy before you start. **Delete this file** once the flicker is
confirmed fixed on a surface I can open; it is a handover, not documentation, and it
lives at the repo root only because `scripts/doc-citations.mjs` walks `docs/`.

---

## MY GOAL

The 3D pipeline is perfect and everything works with no issues — on the site I can
actually open, on every garment, on every colourway. Get me there, and prove it to me
in a live 3D viewer rather than telling me it is done.
