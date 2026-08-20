# Design — the three items PRs #33/#34 deliberately left undone

Date: 2026-08-20. Follows the CLAUDE.md audit and CI fix merged as `087d2ef` and
`90222a5`. That work is done; nothing here revisits it.

Three items were left open. This document records what was measured, what was
decided, and what will change. It does not restate the incidents — those live in
`.github/CLAUDE.md` and beside the code in `.github/workflows/ci.yml`.

## What was measured first

Every number below was taken on 2026-08-20 rather than recalled, because this
repo has twice stated a cost for the Playwright step that later measured false.

**The image.** `mcr.microsoft.com/playwright:v1.62.1-noble` is published and is an
exact match for the `@playwright/test` version pinned in both
`apps/viewer/package.json` and `tools/asset-pipeline/package.json` (1.62.1). Pulled
and inspected rather than read about:

| | |
|---|---|
| Node | v24.18.1 — the repo's pinned Node 24 |
| Browsers at `/ms-playwright` | chromium-1234, chromium_headless_shell-1234, firefox-1538, webkit-2336, ffmpeg-1011 |
| Present | git, tar, gzip, curl, awk, bash |
| **Absent** | **jq**, unzip, sudo, pnpm |
| Default user | root, `HOME=/root` |
| Compressed download | **905 MB** (7 layers, amd64 manifest) |

**Three findings that changed the answer.**

1. **`jq` is absent and `verify` depends on it.** `scripts/test-alert-shell.sh`
   guards on `command -v jq` and exits 1 without it, and its own comment records
   the assumption ("jq is preinstalled on ubuntu runners"). It cannot be ported to
   Node: it evaluates the real `--jq` filter strings taken from `uptime.yml` and
   `heartbeat.yml`, so it needs something that parses jq syntax. This is what rules
   out containerising the whole `verify` job.
2. **A GitHub-hosted runner never caches a job container.** The runner is
   ephemeral and the image is pulled *before the first step runs*, so
   `actions/cache` cannot reach it. The 905 MB is paid every run. Several blog
   posts claim otherwise; that is true only of self-hosted runners.
3. **The mirror swap is already disproven by this repo's own log.**
   `.github/workflows/ci.yml` records that apt *did* fall back to
   `archive.ubuntu.com` and was "far slower". Forcing the non-Azure mirror slows
   the healthy case and does not rescue the degraded one. Rejected on the repo's
   evidence, not on argument.

**Playwright's position.** microsoft/playwright#23388 is closed; the container
image is the endorsed way to avoid apt-get. The one live hazard is Firefox under a
non-root container user (#31685, `Can't find profile directory`), which matters
only because the upstream GitHub Actions example passes `--user 1001`.

**Current cost.** Run 32336966625, healthy, `verify` = 7.7 min:

```
setup + checkout + pnpm + node + install   34s
lint + typecheck + container typecheck      8s
test:coverage                              58s
alert-shell (needs jq)                      1s
seed:assets + build                        51s
bundle budget                               1s
playwright: resolve 0 + cache 7 + apt 25   32s
e2e                                       269s   (58% of the job)
```

`artwork` in the same run = 107s: setup-node 13s, `pnpm install` 15s, apt 14s,
eval 54s. **The apt step costs 25s and 14s when healthy.** On the degraded days it
consumed whole job budgets and turned green gates red — runs at 26.3 and 31.3
minutes, both failures.

**Budget.** The org is on GitHub Enterprise Cloud and Actions Linux minutes
currently bill at net $0, inside the included allowance. Minutes are not the
constraint they were when the uptime job was moved off Actions.

## Item 1 — the apt dependency

Decision: **split the browser work off the runner, staged, measuring at each
step.** Stage 1 only is in scope for this spec. Stage 2 is a separate change,
separately approved.

### Stage 1 — containerise the `artwork` job

`artwork` is the right first subject: 107 seconds, Chromium only, no jq, and no
change to the job graph — but a real deploy gate that was cancelled twice at
20m20s inside this exact step.

Add to the job:

```yaml
  artwork:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.62.1-noble
    timeout-minutes: 30
```

Delete five now-meaningless steps: `Resolve Playwright version`,
`Restore Playwright browsers`, `Install Chromium for the render harness (cache miss)`,
`Install Chromium system deps (cache hit)`, and
`Say so if the system deps did not install`.

Keep checkout, `pnpm/action-setup`, `actions/setup-node`, `pnpm install`, and
`eval:artwork`.

**`actions/setup-node` stays**, though the image already ships Node 24.18.1.
Removing it saves the 13s Node install but also drops `cache: pnpm`, which is part
of why `pnpm install` is only 15s — so the net is unmeasured. Changing one thing
means an unexpected result has one candidate cause, which is the same reason the
workers-types break was bisected rather than reverted by guess. A comment beside
the step records that the 13s is a deliberate later trim, so the next session does
not re-derive this question.

**The container runs as root**, the image default. `--user 1001` is what triggers
the Firefox profile-directory failure, and although `artwork` is Chromium-only,
establishing root here is what makes the stage 2 e2e split safe. Running as root
disables the Chromium sandbox; the render harness already runs software WebGL
through swiftshader, so this costs nothing here. The comment beside the job must
say so, or the next reader will "fix" it.

**Tag-pinned, not digest-pinned.** A digest would go stale in silence:
`.github/dependabot.yml` declares no docker ecosystem, and both ecosystems it does
declare sit at `open-pull-requests-limit: 0`. The tag is instead locked to the
package version by a new gate, below.

### The new gate

A ninth assertion in `apps/cms/src/workflowHardening.test.ts`: every
`container.image` matching `playwright:vX.Y.Z-*` must equal the `@playwright/test`
version declared by the workspace whose scripts that job runs. With a verified
negative control, matching the eight rules already there.

This is what makes the container durable rather than a new trap. Without it, a
routine `@playwright/test` bump pairs new Playwright with the old image's browsers
and fails on an unrelated PR with `browser not found at /ms-playwright/...`.

### What stage 1 must report before stage 2 is written

- the `Initialize containers` step duration — the real 905 MB pull cost on these
  runners, which no amount of reading settles;
- total `artwork` duration against the 107s healthy baseline;
- that the eval passes **including** its `--uv-weight 0` negative control.

Named risk: `sharp` 0.35.3's prebuilt binary under this image. If it breaks it
breaks loudly, and stage 1 is one revert.

### Rejected

- **Containerise `verify` in place** — breaks the alert-shell gate on jq, and puts
  a 905 MB pull in front of `pnpm lint`, which currently fails in 5 seconds.
- **A custom slim image in GHCR** — smaller pull, but nothing in this repo would
  keep it fresh, and it adds a build workflow to a CI surface that is already the
  largest maintenance cost here.
- **A mirror swap or a fastest-mirror action** — disproven above.
- **Do nothing** — defensible, and the floor if stage 1 measures badly.

## Item 2 — `apps/viewer/CLAUDE.md` at 450 lines

Re-checked against the current Claude Code documentation on 2026-08-20. The
guidance has **not** changed: "target under 200 lines per CLAUDE.md file. Longer
files consume more context and reduce adherence." Two of the root file's existing
claims were confirmed verbatim — `@path` imports "load at launch", and after
`/compact` only the project-root file is re-injected while nested files reload on
next read.

Two things have moved since 2026-08-19:

- The 40,000-character figure is a CLI startup warning, not documented guidance,
  and anthropics/claude-code#22364 (closed, not planned) reports its count appears
  to **sum** memory files. If so, working under `apps/viewer/` loads root (36,693
  chars) plus the viewer file (30,516) = 67,209, and "under 40k individually" was
  never the right frame.
- Path-scoped rules have had four documented fixes ship: symlink matching
  (v2.1.198), an invalid pattern no longer breaking Read (v2.1.207),
  `--setting-sources` respected (v2.1.211), and the brace-expansion startup crash
  (v2.1.217). The documented key is `paths:`. The caveat the root file records
  still stands: a rule fires when Claude *reads* a matching file, so creating one
  never triggers it.

**The structural finding.** 357 of the 450 lines are the Traps section. The
natural cluster is headers/CSP/edge/link-preview — 7 traps, 176 lines — and it
does **not** cleave along directory lines. `_headers` is generated, existing only
at `apps/viewer/dist/_headers`, produced by `apps/viewer/scripts/gen-headers.mjs`,
while its other half lives in `apps/viewer/worker/securityHeaders.ts`. A nested CLAUDE.md
under `apps/viewer/worker/` would stay silent while you edit the generator.

That is precisely what a `paths:` glob spanning two directories is for, and it is
why the nested-file mechanism — proven everywhere else in this repo — is the wrong
tool here.

### The change, in order

1. **Widen the citation guard first**, before any prose moves. `documentsToCheck()`
   in `scripts/doc-citations.mjs` covers `*CLAUDE.md`, `audit-ci.jsonc`, everything
   under `docs/`, and README/CONTRIBUTING/SECURITY. It does not cover a rules
   directory, so moving 176 lines of citation-dense prose there would move it out
   from under `apps/cms/src/claudeMd.test.ts` — the exact "the copy is the part
   that decays" failure that test exists to catch. One filter line, scoped to
   `.claude/rules/` only.

   Scoped narrowly on purpose: `.claude/` already holds roughly twenty `.md` files
   — `.claude/skills/README.md`, `.claude/agents/docs-drift.md`, and symlinks into
   `.agents/skills/` — whose citations point at their own upstream repositories. A
   broad widening would demand a wave of exemptions to go green.

2. **Create the rule.** A file under `.claude/rules/` with `paths:` frontmatter
   covering `apps/viewer/worker/**`, `apps/viewer/scripts/**` and
   `apps/viewer/public/**`.

3. **Verify the mechanism before moving any prose.** Open
   `apps/viewer/worker/securityHeaders.ts` and `apps/viewer/scripts/gen-headers.mjs`
   with the Read tool, then read `.claude/instructions-loaded.log` for a
   `path_glob_match` entry. The hook at `.claude/hooks/log-instructions-loaded.mjs`
   is already wired for that reason and the log currently holds only
   `session_start` lines, so a hit is unambiguous.

   **If it does not fire, this design is abandoned** in favour of a nested CLAUDE.md
   under `apps/viewer/worker/`, accepting that editing the generator will not
   load it. The widened guard is harmless either way — one line over an empty
   directory.

4. **Move the 7 traps.** 450 lines becomes roughly 274. Leave a one-line hook in
   `apps/viewer/CLAUDE.md`, the pattern the pipeline and `.github` splits already
   use.

5. **Update the counts and the claims.** The root file's
   "Twenty-three more traps live in `apps/viewer/CLAUDE.md`" becomes sixteen —
   `countTrapBullets` in `apps/cms/src/claudeMd.test.ts` verifies it. Then three
   prose sites that currently assert the opposite of what will be true:
   - `CLAUDE.md` — "this repo still has no `.claude/rules/`", and the paragraph
     ending "Measure before adopting", which is exactly what step 3 does;
   - `scripts/doc-citations.mjs` — the `.claude/rules` exemption, whose own text
     reads "Delete this entry if the repo ever adopts one";
   - `docs/RUNBOOK.md`'s `path_glob_match` table row needs no change; it becomes
     more true, not less.

## Item 3 — the apt/orphan trap

`.github/CLAUDE.md` gains a sixth bullet under `## Traps`, carrying the mechanism
and both failed fixes:

- `timeout-minutes` kills the step's shell, not the `sudo apt-get` it started.
  That process survives as an orphan, keeps installing, and keeps holding
  `/var/lib/dpkg/lock-frontend` — so the bound stops the *waiting*, not the apt,
  and e2e then starts against a half-unpacked system.
- **Retrying is the wrong fix and was tried first**: a second `install-deps` races
  the orphan, loses the lock and exits 100 in five seconds. Five seconds reads as
  "nothing left to do" and is the opposite.
- **Waiting longer is also wrong**: at a 10-minute wait apt still had not
  finished, 33 shared libraries were still missing, and the run reached ~26 minutes
  against a 30-minute ceiling — close enough to risk a `cancelled` conclusion,
  which reads as a failed gate and is not one.

Then `CLAUDE.md`'s cross-reference goes **Five → Six** with the topic line beside
it extended, both checked by `countTrapBullets`.

Written now and revised in the stage 2 change. It does not become obsolete:
`.github/workflows/deploy-shrink.yml` keeps its own `install-deps` path either way.

## Also in scope — one stale trap found en route

`CLAUDE.md`'s shrink-container trap states that "Dependabot's `docker` ecosystem"
updates the digest-pinned base image. `.github/dependabot.yml` declares no docker
ecosystem, and its two declared ecosystems are both at
`open-pull-requests-limit: 0`. The sentence is corrected to say the pin is
maintained by hand; the "do not unpin it" instruction stands and is still right.

No change to `.github/dependabot.yml`. A third ecosystem would either sit at limit
0 and change nothing, or break the deliberate quiet mode.

This matters beyond tidiness: left uncorrected, it is an argument for
digest-pinning the new Playwright image, on a premise that is false.

## Sequencing

Three changes, each independently revertible:

1. Items 2 and 3 plus the stale-trap fix — documentation and one guard line, no
   CI behaviour change.
2. Stage 1 — `artwork` containerised, plus the ninth hardening assertion. Report
   the pull time.
3. Stage 2 — the e2e split. Written only after stage 1 reports. Not in this spec.

## Out of scope

- Splitting `e2e` out of `verify`, and the `deploy` `needs:` edit it requires.
- `.github/workflows/deploy-shrink.yml`'s own `install-deps` path.
- Trimming `actions/setup-node` from container jobs.
- Any change to `.github/dependabot.yml`.
