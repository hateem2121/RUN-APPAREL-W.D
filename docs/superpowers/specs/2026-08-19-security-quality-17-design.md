# Clearing the "Security and quality 17" — design

**Date:** 2026-08-19
**Status:** approved (design), pending implementation plan
**Scope:** the 17 open security alerts on `RUN-APPAREL/run-apparel-viewer`, plus the 3 open issues

---

## The finding that reframes the work

The badge reads **17**. Measured against the repository rather than the badge, it is
**12 pieces of real work and 5 phantoms**.

All 8 Dependabot alerts were created `2026-08-18T11:50Z`. Commit `7c31f8c` landed
`2026-08-19T00:15Z`. Five of the alerts name packages that commit already fixed, and
**GitHub's own dependency graph agrees**: querying the repo's SBOM endpoint returns
`dompurify 3.4.13` and `postcss 8.5.26` — both patched — while the alerts still read
`state: open` with `updated_at` frozen at creation. The graph refreshed; the alert-closing
pass did not.

The general lesson, which outlives these five: **an alert whose `updated_at` never moved
past a known fix is a claim about the past, not the present.** Verify against
`pnpm-lock.yaml` and the dependency-graph SBOM before doing any work a severity badge
appears to demand.

A second reframing applies to `esbuild`. Dependabot labels it `scope: runtime`, and its
advisory is rated medium. Reading the advisory instead of the badge: GHSA-67mh-4wv8-2f99
describes `esbuild serve`'s development server answering cross-origin requests. Tracing
the tree with `pnpm why`, the vulnerable `0.18.20` arrives only through
`@esbuild-kit/core-utils` (deprecated, folded into `tsx`) beneath `drizzle-kit` beneath
Payload's D1 adapter — a path that uses esbuild as a transform library and never starts a
server. The exposure is nil regardless of the label.

---

## Decisions taken by the owner

1. **Keep Lighthouse CI.** Two real alerts (`uuid`, `extract-zip`) come only from
   `@lhci/cli`, and `extract-zip` has no patched release in existence. The performance
   budget check it provides is worth more than a clean badge earned by deletion. Those
   alerts are accepted knowingly and recorded.
2. **"Resolved" means the badge reaches 0 honestly.** Everything genuinely fixable gets
   fixed; the remainder is dismissed with a specific written reason. **No gate is
   weakened** — no CodeQL query-suite downgrade, no test-file exclusions.
3. **Dismissals are performed from this session**, one at a time, only after the real
   fixes are merged and verified, with the exact reason text shown before each is sent.
4. **Every changed test must be proved still able to fail.** For each test touched, the
   thing it guards is deliberately broken, the test is confirmed to fail, and the break is
   reverted.

---

## Section A — Dependabot: 8 → 0

| Alert | Package | Real? | Action |
|---|---|---|---|
| 3, 4, 5, 7 | dompurify | No — at `3.4.13` | Re-trigger evaluation. Dismiss as `inaccurate` **only** if they survive a fresh push, citing the SBOM endpoint. |
| 6 | postcss | No — at `8.5.26` | As above. |
| 1 | esbuild `0.18.20` | Yes, unreachable | Attempt a `pnpm.overrides` lift to `^0.25`. On breakage, dismiss as `tolerable_risk`. |
| 2 | uuid `8.3.2` | Yes, CI-only | Attempt a scoped override under `@lhci/cli`. On breakage, dismiss as `tolerable_risk`. |
| 8 | extract-zip `2.0.1` | Yes, CI-only, **unpatchable** | Dismiss as `tolerable_risk`. |

**Ordering rule.** Attempt the real fix first in every case; dismissal is the fallback,
never the opener. A dismissal that could have been a patch is a lie told to the next
session.

**How the five phantoms get re-evaluated.** There is no public API to force a Dependabot
re-scan; it re-evaluates when the manifest changes on the default branch. No separate
trigger is needed here, because the `esbuild` and `uuid` override attempts modify
`package.json` and `pnpm-lock.yaml` in this same branch — merging it *is* the trigger. The
five are therefore re-checked **after** the pull request merges and before any dismissal is
considered, and the expected outcome is that they close themselves.

**The override hazard.** `package.json` already carries a `pnpm.overrides` block
(`sharp`, `tmp`, `postcss`, `dompurify`, `undici`, three `brace-expansion` majors). Adding
to it is established practice here, not a new mechanism. But `pnpm-workspace.yaml` sets
`minimumReleaseAge: 1440`, and a too-fresh version is **not an error** — the install exits
0 and silently leaves the old version. Any override must therefore be verified by reading
the resulting lockfile, never by trusting the command's exit code.

**Verification for A:** `pnpm install --frozen-lockfile`, then `pnpm build` (the gate that
catches dependency breaks — `pnpm typecheck` passed for the entire time the TypeScript 6
pin was broken), then confirm the `lighthouse` job still runs.

### Reason text for dismissals

Recorded here so the wording is reviewable before it is written to GitHub, and so a future
session can find the reasoning without reading the security tab.

- **extract-zip (`tolerable_risk`):** "Reached only through `@lhci/cli` →
  `lighthouse` → `puppeteer-core` → `@puppeteer/browsers`, a CI-only devDependency that
  never ships to users and never runs against untrusted archives. No patched release
  exists as of 2026-08-19. Owner decision 2026-08-19: retain Lighthouse CI for its
  performance budget check and accept this knowingly."
- **esbuild (`tolerable_risk`, only if the override fails):** "Advisory describes
  `esbuild serve`'s development server. The vulnerable `0.18.20` is reached only via
  `@esbuild-kit/core-utils` → `drizzle-kit` → `@payloadcms/db-d1-sqlite`, which uses
  esbuild as a transform library and never starts a server."
- **uuid (`tolerable_risk`, only if the override fails):** "Reached only through
  `@lhci/cli`, a CI-only devDependency. The advisory requires a caller-supplied `buf`
  argument to v3/v5/v6, which this path does not use."

---

## Section B — Code scanning: 9 → 0, entirely by real fixes

Scanning runs as **default setup** with the `extended` query suite. That suite is why the
test-file rules fire at all. It is deliberately left alone.

### B1 — Polynomial ReDoS, `packages/shared/src/variants.ts:52` (high)

`buildVariantId` collapses non-alphanumerics, then trims hyphens with `/^-+|-+$/g`. The
`-+$` alternative backtracks at every position, giving O(n²) on a hyphen-heavy input.

Reachability, traced rather than assumed: the sole non-test caller is
`apps/cms/src/endpoints/pipelinePlan.ts:65`, which passes a colourway slug read from the
CMS database. The input is CMS-authored, not a URL segment — so this is a latent defect
with a narrow trigger, not a live denial-of-service. It is fixed because the fix is
smaller than the argument against it.

**Change:** one linear pass with no backtracking —
`colourSlug.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).join('-')`.

**Behaviour is already pinned** by `packages/shared/src/variants.test.ts`, which asserts
`' navy! '` → `N001-NAVY`, `'--forest--'` → `N001-FOREST`, `'sea/foam'` → `N001-SEA-FOAM`.
Those assertions must pass unchanged; that is the proof the rewrite is equivalent.

### B2 — Stack-trace exposure, `apps/shrink/container/server.ts:163` (medium)

The container catches an error and writes the message into **both** the `x-shrink-report`
header (base64 JSON) and the response body.

**The trap:** `apps/shrink/src/index.ts:263` handles a non-OK container response by
reading the **body** and never consults the header in that branch — the header is only
decoded at `apps/shrink/src/index.ts:268`, which is reached only when the response *was*
OK. Genericising the body alone would silently reduce every container failure to
`Container returned 500: `, destroying the diagnostic that the shrink pipeline's whole
error path depends on.

**Change, in this order, in one commit:**
1. Teach the Worker's non-OK branch to prefer the decoded `x-shrink-report` error, falling
   back to the body.
2. *Then* make the container body a fixed generic string, leaving the detail in the header.

Order is load-bearing: reversed, there is an interval where failures report nothing.

### B3 — Incomplete comment stripping, `apps/viewer/scripts/og.test.ts:31` and `apps/viewer/worker/preview.test.ts:261` (high ×2)

Both strip HTML comments with a single `replace(/<!--[\s\S]*?-->/g, '')` pass so that
commented-out prose in `index.html` cannot satisfy an assertion.

**This is a test-correctness fix, not cosmetic.** An incomplete strip leaves a comment
behind, and a surviving comment can satisfy the very `toMatch` the strip exists to
protect — producing a false **pass**. `og.test.ts` documents that exact failure already
happening once, in the other direction.

**Change:** repeat the replacement until the string stops changing.

### B4 — Bad tag filter, `apps/viewer/scripts/themeColor.test.ts:62` (high)

Counts inline scripts with `matchAll(/<script>/g)` and asserts exactly one, because the
CSP is hash-based and a second inline block means a second hash. The literal match misses
`<SCRIPT>` and `<script >`, so a second inline script could be added without the count
moving — the test would pass while the CSP silently broke.

**Change:** match script open-tags robustly and case-insensitively, then filter to those
carrying no attributes. The asserted count stays exactly 1.

### B5 — Incomplete sanitization, `apps/viewer/scripts/preload.test.ts:67` (high)

Escapes a hostname for a regex with `host.replace(/\./g, '\\.')` — dots only.

**`RegExp.escape()` is NOT usable here, and the reason is worth recording.** It exists in
this machine's Node 24.18.1 (verified by execution, contradicting published articles that
say Node lacks it), but every workspace pins `"lib": ["ES2022"]` and TypeScript rejects it
under that setting with `TS2550: Property 'escape' does not exist on type
'RegExpConstructor'` (verified by compiling a probe at the repo's own target). Raising
`lib` to `es2025` would clear the error and simultaneously tell TypeScript that ES2025
APIs are safe throughout a browser bundle. `ES2022` is a compatibility floor for shipped
viewer code; it is not moved to satisfy one test file.

**Change:** the complete-escape idiom `.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`, which is
what CodeQL's guidance for this rule prescribes.

### B6 — Incomplete sanitization, `scripts/sbom.mjs:90` (high)

Builds a package URL with `pkg.name.replace('@', '%40')`. A string-argument `replace`
substitutes only the **first** occurrence. It is correct for today's scoped names, which
carry exactly one `@`, and wrong the moment that assumption stops holding — in a file
whose entire output is what vulnerability scanners match on.

**Change:** encode the scope segment properly per the purl specification rather than
patching one character.

### B7 — File data over HTTP, `scripts/import-catalogue-products.mjs:108` and `:114` (medium ×2)

Catalogue rows read from disk are POSTed to `${API_BASE}${pathname}`, where `API_BASE` is
`process.env.CMS_API_BASE` defaulting to `https://cms.wear-run.help`. An operator
exporting `CMS_API_BASE=http://…` would send catalogue data **and an API key** in
cleartext, and nothing would say so.

**Change:** assert the resolved base is `https://` before the first request and exit with
a clear message otherwise. No `localhost` exemption — `docs/RUNBOOK.md` documents only
https origins for this variable, so an exemption would be speculative.

### Test-integrity protocol for B3, B4, B5

Per the owner's decision, for each changed test: break the guarded property, run the
test, **record that it fails**, restore. Specifically —

- **B3 (og / preview):** delete one `<meta>` tag from `apps/viewer/index.html`; both
  tests must fail.
- **B4 (themeColor):** add a second bare `<script>` block to `apps/viewer/index.html`; the
  count assertion must fail.
- **B5 (preload):** remove `crossorigin` from one `preconnect` link; the test must fail.

A changed test that cannot be made to fail is a regression, not a fix.

---

## Section C — the three open issues

### C1 — Issue #31, "A scheduled check has stopped running" — a real, self-perpetuating bug

`.github/workflows/heartbeat.yml` watches `uptime.yml` with a **3-hour** budget and a note
reading `scheduled every 15 min, delivered ~45 min median`. That note is stale:
`.github/workflows/uptime.yml` now carries a single `cron: '23 7 * * *'` — **once daily** —
after uptime moved off GitHub Actions for consuming the free-minutes budget.

A daily workflow breaches a 3-hour budget every single day. **This issue re-opens forever
until the budget is corrected**, and a monitor that cries wolf daily is a monitor nobody
reads — the precise failure mode `heartbeat.yml`'s own header comment was written to
prevent.

**Change:** raise the budget to **36 hours** and rewrite the cadence note to describe the
daily schedule. Then close #31.

⚠️ **This document said 30 hours until the plan was written.** The arithmetic is 24 h
cadence plus the 6.1 h worst delivery gap measured 2026-08-10 = ~30.1 h worst inter-run
gap — and the comparison is `[ "$age_h" -gt "$hours" ]`, which fires at 31 h. A 30 h budget
therefore sits **one hour** from the false alarm this change exists to remove. 36 h leaves
~6 h of headroom and still catches a dead workflow inside a day and a half, sampled by a
job that runs every 6 h.

⚠️ **The cadence label must contain no colon.** `heartbeat.yml` parses `WATCHED` with
`while IFS=: read -r file hours cadence`, and its own comment warns that a colon is read as
an extra field and silently truncates. `daily at 07:23 UTC` would break the watchdog while
looking correct; the label is written `daily at 0723 UTC`.

`apps/cms/src/workflowHardening.test.ts` gates every workflow edit: the top-level
`permissions:` block must survive (it must keep `contents`, whose absence 404s checkout on
this private repo), `timeout-minutes` must remain on the job, and no `${{ github.event.* }}`
may enter a `run:` block. This change touches only a shell string and comments, but the
gate is what proves that.

### C2 — Issue #22, "Outage: health check failing"

Measured 2026-08-19: `run-apparel-viewer-cms.hateemjamshaid.workers.dev/api/health` → **200**,
`viewer.wear-run.help/rxps/wine` → **200**. The alert fired 2026-08-15 and the condition
has cleared.

**Change:** close with the measurements quoted. Note the URL in the issue body is the
pre-rename `n001` path, which returns 200 from an SPA regardless — the `rxps` probe above
is the one that carries information.

### C3 — Issue #19, "Viewer diagnostics — weekly digest"

Informational by design. Its one open question is `route-unparsed ×10`, emitted at
`apps/viewer/src/App.tsx:62` when a path does not resolve to a product and colourway.

**Change:** inspect the recorded `reason` values once. If they are apex or crawler paths,
close the issue as informational and record that finding; if they are real product URLs,
that is a separate defect and gets its own issue rather than being absorbed here.

---

## Section D — delivery and verification

**One branch, one pull request, commits grouped by section.** `ci.yml` sets
`concurrency: cancel-in-progress: true` on `ci-${{ github.ref }}`, so a second push kills
the first run, and `gh run watch --exit-status` returns 1 for a *cancelled* run exactly as
it does for a failure. Read `gh run view <id> --json conclusion` before believing anything
failed, and never push twice in a row.

**Gates, in CI's order.** `pnpm` means `npx --yes pnpm@10.33.0`; the bare command exits
127 on this machine.

```
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:coverage
bash scripts/test-alert-shell.sh
pnpm seed:assets && pnpm build
node scripts/check-bundle-budget.mjs
pnpm eval:artwork
```

Plus the three that are invisible from the workspace: the `apps/shrink/container` typecheck
(not a pnpm member — `npm install --no-audit --no-fund && npx tsc --noEmit`), `eval:artwork`
in its own CI job, and `check-bundle-budget`, which reads `apps/viewer/dist` and exits 1
unless `pnpm build` ran first.

**Coverage floors are measured, not chosen.** No threshold in `vitest.coverage.mjs` is
lowered to accommodate any change here.

**This document is citation-checked.** Every path cited above is verified to exist.
⚠️ CLAUDE.md says a line RANGE never resolves; that became stale on 2026-08-18, when
`scripts/doc-citations.mjs:151` gained a range branch — its regex is now
`/:\d+(?:[:-]\d+)?$/`, which strips `:42`, `:42:7` and `:42-80` alike. Verified by reading
the regex rather than the note. The gate is `apps/cms/src/claudeMd.test.ts`, run as
`pnpm --filter @run-apparel/cms test`; `node scripts/doc-citations.mjs` is a **module with
no main** and exits 0 having checked nothing.

**If anything fails inexplicably**, run `env | grep -E 'NODE_ENV|PORT'` before reading any
code. Both variables have been present in some sessions and absent in others on this same
machine.

---

## Explicitly out of scope

- Downgrading the CodeQL query suite from `extended`.
- Excluding test files from scanning, whether by `paths-ignore` or the
  `github-codeql-config-file` repository property added 2026-08-04. Both are legitimate
  tools; neither is used here, because every alert in Section B is being fixed on its
  merits and both would reduce what future scans check.
- Removing `@lhci/cli` (owner decision, Section A).
- Raising any workspace's TypeScript `lib` beyond `ES2022` (see B5).
- The 66 model-less catalogue drafts and the printed catalogue's own defects — unrelated
  to these alerts.

## Success criteria

1. GitHub reports **0 open** Dependabot alerts and **0 open** code-scanning alerts.
2. Every alert not closed by a code change carries a written, specific dismissal reason,
   reproduced in this document.
3. Issues #19, #22, #31 closed, with #31 closed by a fix rather than by a button — proved
   by `heartbeat.yml` no longer being able to breach its budget on a daily cadence.
4. Every gate above exits 0, including the three invisible ones.
5. Every changed test demonstrated to fail when the property it guards is broken.
