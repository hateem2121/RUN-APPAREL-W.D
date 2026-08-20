# CI apt dependency and memory-file sizing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the CI apt dependency from the `artwork` job by running it in
Playwright's own container image, split the viewer's headers/CSP traps into a
path-scoped rule, and record the apt/orphan mechanism in `.github/CLAUDE.md`.

**Architecture:** Three independently revertible changes, documentation first so
the CI change lands against an already-green tree. The container change is stage 1
of two; stage 2 (splitting e2e out of `verify`) is deliberately out of scope and
is written only after stage 1 reports its real image-pull time.

**Tech Stack:** GitHub Actions, `mcr.microsoft.com/playwright:v1.62.1-noble`,
vitest, Biome, Node 24.

**Spec:** `docs/superpowers/specs/2026-08-20-ci-apt-and-memory-sizing-design.md`

## Global Constraints

- `pnpm` is **not** on PATH here. Every `pnpm <script>` below means
  `npx --yes pnpm@10.33.0 <script>`.
- If a build or test server fails in a way that makes no sense, run
  `env | grep -E 'NODE_ENV|PORT'` before reading any code.
- Container image tag is **`mcr.microsoft.com/playwright:v1.62.1-noble`** —
  exactly matching the `@playwright/test` version declared at
  `apps/viewer/package.json` and `tools/asset-pipeline/package.json`.
- The container runs as **root** (image default). Do **not** add `--user 1001`:
  that is what triggers the Firefox profile-directory failure.
- Workflow edits are gated by `apps/cms/src/workflowHardening.test.ts`. Run it
  before pushing any workflow change.
- `apps/cms/src/claudeMd.test.ts` gates every trap count and every citation.
- Comments in this repo explain *why*, citing the incident. Prefer stating a
  measurement over an adjective.

---

### Task 1: Widen the citation guard to `.claude/rules/`

Must land before any prose moves, so the 176 lines are never unguarded.

**Files:**
- Modify: `scripts/doc-citations.mjs` (the `documentsToCheck` function)
- Test: `apps/cms/src/claudeMd.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `documentsToCheck(root)` returns `.claude/rules/**.md` in addition to
  its existing set. Same signature, same return type (`Promise<string[]>`).

- [ ] **Step 1: Write the failing test**

Add to the `describe('the doc-citations command', ...)` block in
`apps/cms/src/claudeMd.test.ts`, directly after the `covers docs/ recursively`
test:

```ts
  it('covers .claude/rules/ — a rule file holds trap prose no other guard reads', async () => {
    // Scoped to rules/ and NOT to all of .claude/: that directory also holds
    // .claude/skills/README.md and .claude/agents/docs-drift.md, plus symlinks into
    // .agents/skills/, whose citations point at their own upstream repositories.
    // Widening to the whole directory would demand a wave of exemptions to go green.
    const decoy = join(REPO_ROOT, '.claude', 'rules', 'CITATION-COVERAGE-CONTROL.md')
    await mkdir(dirname(decoy), { recursive: true })
    await writeFile(decoy, 'A citation to `apps/cms/src/does-not-exist.ts` here.\n')
    try {
      const run = spawnSync(process.execPath, [script], { cwd: REPO_ROOT, encoding: 'utf8' })
      const output = run.stdout + run.stderr
      expect(run.status, 'a broken citation inside .claude/rules/ must fail the gate').toBe(1)
      expect(output).toContain('CITATION-COVERAGE-CONTROL.md')
    } finally {
      await rm(decoy, { force: true })
    }
  })
```

Add `mkdir` to the `node:fs/promises` import and `dirname` to the `node:path`
import in that file if they are not already present.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/claudeMd.test.ts
```

Expected: FAIL — the run exits 0 because `documentsToCheck` filters the rules file
out, so the broken citation is never read.

- [ ] **Step 3: Widen `documentsToCheck`**

In `scripts/doc-citations.mjs`, inside `documentsToCheck`:

```js
export async function documentsToCheck(root) {
  const all = await walkDocuments(root)
  const docsDir = join(root, 'docs')
  // Path-scoped rules carry the same trap prose as a CLAUDE.md and must be checked
  // the same way — adopted 2026-08-20 when the viewer's headers/CSP traps moved into
  // one. Scoped to rules/ deliberately: .claude/ also holds vendored skill documents
  // whose citations point at their own repositories.
  const rulesDir = join(root, '.claude', 'rules')
  return all.filter((path) => {
    const name = path.slice(root.length + 1)
    if (path.endsWith('CLAUDE.md') || path.endsWith('audit-ci.jsonc')) return true
    if (path.startsWith(`${docsDir}/`)) return true
    if (path.startsWith(`${rulesDir}/`)) return true
    return ['README.md', 'CONTRIBUTING.md', 'SECURITY.md'].includes(name)
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/claudeMd.test.ts
```

Expected: PASS, all tests.

- [ ] **Step 5: Confirm the real corpus is still clean**

```bash
node scripts/doc-citations.mjs
```

Expected: `✓ N citations checked across N documents; 0 unresolved.` and exit 0.

- [ ] **Step 6: Lint and commit**

```bash
npx --yes pnpm@10.33.0 lint
git add scripts/doc-citations.mjs apps/cms/src/claudeMd.test.ts
git commit -m "test(docs): a rules file holds trap prose, and no guard was reading it"
```

---

### Task 2: Create the rule and prove it loads

The abort gate for Task 3. No prose moves until `path_glob_match` is observed.

**Files:**
- Create: `.claude/rules/viewer-headers.md`
- Read (verification only): `apps/viewer/worker/securityHeaders.ts`,
  `apps/viewer/scripts/gen-headers.mjs`, `.claude/instructions-loaded.log`

**Interfaces:**
- Consumes: the widened `documentsToCheck` from Task 1.
- Produces: a rule file whose `paths:` frontmatter matches the viewer's worker,
  scripts and public directories.

- [ ] **Step 1: Create the rule with frontmatter and a placeholder body**

```markdown
---
paths:
  - "apps/viewer/worker/**"
  - "apps/viewer/scripts/**"
  - "apps/viewer/public/**"
---

# Viewer headers, CSP and the edge

Loads when you touch the viewer's Worker, its header generators, or its static
assets. These traps do not cleave along directory lines — `_headers` is generated
by `apps/viewer/scripts/gen-headers.mjs` into `apps/viewer/dist/`, while the half
that answers for it lives in `apps/viewer/worker/securityHeaders.ts` — which is
why this is a path-scoped rule and not a nested CLAUDE.md.

## Traps
```

- [ ] **Step 2: Verify the mechanism fires**

Open both files **with the Read tool** (not `cat` — the hook fires on the Read
tool, not on a shell command), then read the log:

```bash
node -e "console.log(require('fs').readFileSync('.claude/instructions-loaded.log','utf8'))"
```

Expected: at least one line whose second field is `path_glob_match` and whose
third field is the rule's path. The log currently holds only `session_start`
lines, so a hit is unambiguous.

- [ ] **Step 3: Decide**

If `path_glob_match` appears — continue to Task 3 unchanged.

If it does **not** appear — stop. Delete `.claude/rules/viewer-headers.md`,
create a CLAUDE.md under `apps/viewer/worker/` instead with the same 7 traps, and in Task 3
substitute that path everywhere, accepting that editing
`apps/viewer/scripts/gen-headers.mjs` will not load them. Task 1 stays either way;
one filter line over an empty directory costs nothing.

- [ ] **Step 4: Commit the empty rule**

```bash
git add .claude/rules/viewer-headers.md
git commit -m "docs(viewer): a rule that loads for the worker AND its header generators"
```

---

### Task 3: Move the seven headers/CSP traps

**Files:**
- Modify: `apps/viewer/CLAUDE.md` (remove lines 191–366, add a hook line)
- Modify: `.claude/rules/viewer-headers.md` (receive them)
- Modify: `CLAUDE.md` (count 23 → 16; the `.claude/rules/` claims)
- Modify: `scripts/doc-citations.mjs` (delete the `.claude/rules` exemption)

**Interfaces:**
- Consumes: the rule file from Task 2, the widened guard from Task 1.
- Produces: `apps/viewer/CLAUDE.md` at 16 trap bullets under `## Traps`;
  `countTrapBullets` in `apps/cms/src/claudeMd.test.ts` must agree with the root
  file's claim.

- [ ] **Step 1: Move lines 191–366 verbatim**

Cut `apps/viewer/CLAUDE.md` lines 191 through 366 — the seven bullets beginning
"The CSP violation on every page load is Bot Fight Mode" and ending
"A build-time CSP cannot cover an edge-injected script" — and append them under
`## Traps` in `.claude/rules/viewer-headers.md`. **Verbatim.** Do not reword: the
measurements and incident dates are the load-bearing part.

Verify the arithmetic:

```bash
wc -l apps/viewer/CLAUDE.md          # expect 274
node -e '
const {readFileSync}=require("fs");
const c=(md)=>{const s=md.search(/^## Traps/m);if(s===-1)return 0;const r=md.slice(s);const e=r.slice(1).search(/^## /m);return [...(e===-1?r:r.slice(0,e+1)).matchAll(/^- \*\*/gm)].length};
console.log("viewer:", c(readFileSync("apps/viewer/CLAUDE.md","utf8")));
console.log("rule:  ", c(readFileSync(".claude/rules/viewer-headers.md","utf8")));'
```

Expected: `viewer: 16`, `rule: 7`.

- [ ] **Step 2: Add the hook line to `apps/viewer/CLAUDE.md`**

Append as the final bullet of its `## Traps` section. It must NOT match
`/^- \*\*/` or it inflates the count — start it with plain text:

```markdown
- Seven headers/CSP/edge traps moved to `.claude/rules/` on 2026-08-20 and load
  automatically when you touch `apps/viewer/worker/`, `apps/viewer/scripts/` or
  `apps/viewer/public/`. Enough of a hook to make you open them: the CSP violation
  on every page load is **Bot Fight Mode, not Web Analytics**; `_headers` rules
  that both match are **combined, not overridden**; `_headers` survives
  `env.ASSETS.fetch()` but does **NOT** reach a response the Worker builds itself;
  link previews are **crawler-only** and the number is why; `og:image` must not be
  the WebP poster; and a build-time CSP cannot cover an edge-injected script.
  ⚠️ A path-scoped rule is not re-injected after `/compact` — same caveat the
  nested files carry.
```

Re-run the counter from Step 1: `viewer:` must still be **16**.

- [ ] **Step 3: Update the root file's count**

In `CLAUDE.md`, change `**Twenty-three more traps live in` to
`**Sixteen more traps live in` and edit the topic list beside it so it no longer
advertises the headers/CSP traps as living in the viewer file.

- [ ] **Step 4: Correct the two `.claude/rules/` claims**

In `CLAUDE.md`, the sentence "That is why this repo still has no
`.claude/rules/` and splits into nested CLAUDE.md files instead" is now false.
Replace that paragraph's conclusion with what was measured, keeping the caveat
that is still true:

```markdown
  ⚠️ **Path-scoped rules were ADOPTED 2026-08-20, after measuring — and the caveat
  that blocked them in August still stands.** A rule fires when Claude *reads* a
  matching file, so **creating** a new file never triggers it
  (anthropics/claude-code#63142). Four upstream fixes have since shipped (symlink
  matching v2.1.198, an invalid pattern no longer breaking Read v2.1.207,
  `--setting-sources` respected v2.1.211, the brace-expansion startup crash
  v2.1.217) and the documented key is `paths:`. The first rule here is
  `.claude/rules/` → viewer-headers, adopted because its 7 traps span
  `apps/viewer/worker/` AND `apps/viewer/scripts/` and a nested CLAUDE.md keys on
  ONE directory. It was verified by reading a matching file and finding
  `path_glob_match` in `.claude/instructions-loaded.log` before any prose moved —
  do the same before adding a second.
```

- [ ] **Step 5: Delete the now-wrong exemption**

In `scripts/doc-citations.mjs`, remove the `ALLOWED_ABSENT` entry keyed
`.claude/rules`. Its own text instructs this: "Delete this entry if the repo ever
adopts one."

- [ ] **Step 6: Run the gates**

```bash
node scripts/doc-citations.mjs
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/claudeMd.test.ts
```

Expected: `0 unresolved`, and all tests pass — including the trap-count assertion,
which now compares sixteen against sixteen.

- [ ] **Step 7: Lint and commit**

```bash
npx --yes pnpm@10.33.0 lint
git add apps/viewer/CLAUDE.md .claude/rules/viewer-headers.md CLAUDE.md scripts/doc-citations.mjs
git commit -m "docs(viewer): 450 lines against a 200-line target, and the split had to cross two directories"
```

---

### Task 4: Record the apt/orphan trap

**Files:**
- Modify: `.github/CLAUDE.md` (a sixth bullet under `## Traps`)
- Modify: `CLAUDE.md` (Five → Six, plus the topic line)

**Interfaces:**
- Consumes: `countTrapBullets` from Task 3's verification.
- Produces: `.github/CLAUDE.md` at 6 trap bullets; the root claim reads "Six".

- [ ] **Step 1: Add the sixth trap**

Append under `## Traps` in `.github/CLAUDE.md`:

```markdown
- **`timeout-minutes` kills the STEP'S SHELL, not the `apt-get` that step started.**
  The child survives as an orphan, KEEPS INSTALLING, and keeps holding
  `/var/lib/dpkg/lock-frontend` — so the bound does not stop apt, it only stops
  WAITING for apt, and the next step then runs against a half-unpacked system. On
  run 32248711203 `libevent-2.1-7t64` had been downloaded and not yet unpacked when
  e2e began, and all 23 viewer-webkit tests died on `libevent-2.1.so.7: cannot open
  shared object file` while all 119 chromium/firefox tests passed — which reads as a
  WebKit regression and is not one.
  ⚠️ **RETRYING IS THE WRONG FIX AND WAS TRIED FIRST** (run 32290202909): a second
  `install-deps` races the orphan, loses the lock immediately and exits 100 in five
  seconds — `dpkg frontend lock was locked by another process`. Five seconds reads
  like "nothing left to do" and is the opposite.
  ⚠️ **WAITING LONGER IS ALSO WRONG** (run 32294473409): at a 10-minute wait apt
  still had not finished, 18+ minutes total, and the `ldd` check then reported
  THIRTY-THREE missing libraries — essentially the whole WebKit stack. The wait only
  cost the job its headroom, reaching ~26 minutes against 30, close enough to risk a
  `cancelled` conclusion, which reads as a failed gate and is not one. The loop
  budget must stay STRICTLY BELOW the step's own `timeout-minutes`, or the step is
  killed before `dpkg --configure -a` can run.
  ✅ `ci.yml`'s `artwork` job stopped depending on apt on 2026-08-20 by running in
  `mcr.microsoft.com/playwright:v1.62.1-noble`. `verify` and
  `.github/workflows/deploy-shrink.yml` still shell out to `apt`, so this trap is
  live for both.
```

- [ ] **Step 2: Update the root count**

In `CLAUDE.md`, `**Five more traps live in` → `**Six more traps live in`, and
extend the topic line beside it with the orphan mechanism.

- [ ] **Step 3: Verify the counter agrees**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/claudeMd.test.ts
```

Expected: PASS. A stale count fails with "claims Five (5) traps in
.github/CLAUDE.md, which has 6".

- [ ] **Step 4: Commit**

```bash
git add .github/CLAUDE.md CLAUDE.md
git commit -m "docs(github): the bound stopped waiting for apt, not apt — and only ci.yml's comments said so"
```

---

### Task 5: Correct the stale Dependabot claim

**Files:**
- Modify: `CLAUDE.md` (the shrink-container trap)

**Interfaces:**
- Consumes: nothing. Produces: nothing. Prose only.

- [ ] **Step 1: Fix the sentence**

The trap currently reads "The base image is **digest-pinned** for build
reproducibility (sharp links against system libs); Dependabot's `docker` ecosystem
updates it — do not unpin it to make an update easier." Replace the middle clause:

```markdown
  The base image is **digest-pinned** for build reproducibility (sharp links against
  system libs). ⚠️ **NOTHING AUTOMATED REFRESHES THAT PIN — this line claimed
  "Dependabot's `docker` ecosystem updates it" until 2026-08-20 and that was never
  true.** `.github/dependabot.yml` declares no docker ecosystem, and the two it does
  declare (npm, github-actions) both sit at `open-pull-requests-limit: 0` by
  deliberate quiet-mode decision. Bump the digest by hand. Do not unpin it to make an
  update easier, and do not "fix" this by adding a third ecosystem — it would either
  sit at 0 and change nothing, or break the quiet mode on purpose.
```

- [ ] **Step 2: Verify and commit**

```bash
node scripts/doc-citations.mjs
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/claudeMd.test.ts
git add CLAUDE.md
git commit -m "docs: the docker ecosystem that maintains the shrink pin does not exist"
```

---

### Task 6: Containerise `artwork`, and gate the image tag

**Files:**
- Modify: `.github/workflows/ci.yml` (the `artwork` job, ~line 435)
- Modify: `apps/cms/src/workflowHardening.test.ts` (a ninth rule + negative control)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `playwrightImageVersions(source): string[]` — returns every
  `X.Y.Z` found in a `container.image` matching `playwright:vX.Y.Z-*` in one
  workflow source. Exported shape kept simple so the negative control can run it
  against a synthetic workflow.

- [ ] **Step 1: Write the failing test**

Add to `apps/cms/src/workflowHardening.test.ts`, above the closing `})` of
`describe('workflow hardening', ...)`:

```ts
/**
 * Versions in a `container: image: .../playwright:vX.Y.Z-suffix` line.
 *
 * The image ships the browsers; the package drives them. If they drift, Playwright
 * fails at RUNTIME on an unrelated PR with `browser not found at /ms-playwright/...`,
 * which is a bad place to learn about a version bump. Kept as a pure function on a
 * source string so the negative control can prove it distinguishes match from
 * mismatch instead of returning [] for everything.
 */
function playwrightImageVersions(source: string): string[] {
  return [...source.matchAll(/image:\s*\S*playwright:v(\d+\.\d+\.\d+)\b/g)]
    .map((m) => m[1])
    .filter((v): v is string => v !== undefined)
}

it('pins every Playwright container image to the declared @playwright/test version', async () => {
  const declared = new Set<string>()
  for (const pkg of ['apps/viewer/package.json', 'tools/asset-pipeline/package.json']) {
    const json = JSON.parse(readFileSync(join(REPO_ROOT, pkg), 'utf8'))
    const version = json.devDependencies?.['@playwright/test'] ?? json.dependencies?.['@playwright/test']
    if (version) declared.add(String(version).replace(/^[^\d]*/, ''))
  }

  // apps/cms/src/dependencyPolicy.test.ts already forbids two workspaces declaring
  // different versions of a shared dependency, so this should be a set of one. Assert
  // it rather than assume it — if that ever changes, "the declared version" stops
  // meaning anything and this gate must be rewritten, not silently pick the first.
  expect([...declared], 'workspaces disagree on @playwright/test').toHaveLength(1)
  const [expected] = [...declared]

  const offenders: string[] = []
  for (const file of await workflowFiles()) {
    for (const found of playwrightImageVersions(read(file))) {
      if (found !== expected) offenders.push(`${file}: image v${found} != @playwright/test ${expected}`)
    }
  }

  expect(
    offenders,
    'A container image and @playwright/test have drifted. The image ships the browsers;\n' +
      'a mismatch fails at runtime with "browser not found at /ms-playwright/...".\n' +
      `${offenders.join('\n')}`,
  ).toEqual([])
})

it('the Playwright image check can actually fail (negative control)', () => {
  const drifted = `
jobs:
  artwork:
    container:
      image: mcr.microsoft.com/playwright:v1.60.0-noble
  other:
    runs-on: ubuntu-latest
`
  expect(playwrightImageVersions(drifted)).toEqual(['1.60.0'])
  expect(playwrightImageVersions(drifted.replace('v1.60.0', 'v1.62.1'))).toEqual(['1.62.1'])
  // A workflow with no container at all must yield [], not a false positive.
  expect(playwrightImageVersions('jobs:\n  a:\n    runs-on: ubuntu-latest\n')).toEqual([])
})
```

Ensure `readFileSync` and `join` are imported in that file (they are — `read()`
and `REPO_ROOT` already use them).

- [ ] **Step 2: Run it to verify it passes trivially, then confirm it can fail**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/workflowHardening.test.ts
```

Expected: PASS. With no container yet, `offenders` is empty — the negative control
is what proves the parser is not decorative at this point.

- [ ] **Step 3: Containerise the `artwork` job**

In `.github/workflows/ci.yml`, add to the `artwork` job, directly under
`runs-on: ubuntu-latest`:

```yaml
    # NO APT SINCE 2026-08-20. This job was CANCELLED twice at exactly 20m20s inside
    # `playwright install-deps chromium` — an apt-get — while Azure's Ubuntu mirror was
    # degraded and nothing in this repository had changed. Raising the ceiling only moved
    # which job died. The image already carries Chromium and its system libraries, so the
    # mirror is no longer on this job's critical path at all; it pulls ~905 MB from MCR
    # instead. A hosted runner is ephemeral and the image is pulled BEFORE the first step,
    # so actions/cache cannot help and that pull is paid every run — see the measured
    # numbers in the deleted steps' place below.
    #
    # ROOT ON PURPOSE, no `--user 1001`. That is what triggers Firefox's
    # `Can't find profile directory` (microsoft/playwright#31685). This job is
    # Chromium-only so it would not bite here, but establishing root is what makes the
    # e2e split safe later. Running as root disables the Chromium sandbox; the render
    # harness already runs software WebGL through swiftshader, so it costs nothing.
    #
    # THE TAG IS NOT DECORATIVE. It must equal the @playwright/test version — the image
    # ships the browsers, the package drives them. apps/cms/src/workflowHardening.test.ts
    # fails if they drift. Tag, not digest: .github/dependabot.yml declares no docker
    # ecosystem, so a digest would go stale in silence.
    container:
      image: mcr.microsoft.com/playwright:v1.62.1-noble
```

- [ ] **Step 4: Delete the five now-meaningless steps**

Remove from the `artwork` job, along with their comment blocks:
`Resolve Playwright version`, `Restore Playwright browsers`,
`Install Chromium for the render harness (cache miss)`,
`Install Chromium system deps (cache hit)`, and
`Say so if the system deps did not install`.

Leave in place, in order: `actions/checkout`, `pnpm/action-setup`,
`actions/setup-node`, `pnpm install --frozen-lockfile`, `Artwork legibility eval`.

- [ ] **Step 5: Record why `setup-node` stays**

Add above the `actions/setup-node` step in the `artwork` job:

```yaml
      # KEPT DELIBERATELY, though the image ships Node 24.18.1. Measured on run
      # 32336966625: this step is 13s of a 107s job — but it also carries `cache: pnpm`,
      # which is part of why `pnpm install` below is 15s. The net of removing it is
      # UNMEASURED, so removing it now would be tuning against a guess. Trim it as its
      # own change, with a before/after, or leave it.
```

- [ ] **Step 6: Run the workflow gate**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/workflowHardening.test.ts
```

Expected: PASS — including the new rule, now with one real container image to check
(1.62.1 against 1.62.1), and the eight pre-existing rules.

- [ ] **Step 7: Commit**

```bash
npx --yes pnpm@10.33.0 lint
git add .github/workflows/ci.yml apps/cms/src/workflowHardening.test.ts
git commit -m "fix(ci): the artwork job kept dying inside apt, so stop depending on apt"
```

- [ ] **Step 8: Report the measurements**

After the run, capture and report:

```bash
gh api /repos/RUN-APPAREL/run-apparel-viewer/actions/runs/<id>/jobs \
  --jq '.jobs[] | select(.name=="artwork") | .steps[] | "\((((.completed_at|fromdate) - (.started_at|fromdate))|tostring))s\t\(.name)"'
```

Compare `Initialize containers` against the deleted apt step's 14s, and the total
against the 107s healthy baseline. Those numbers decide whether stage 2 is written.

---

## Out of scope

- Splitting `e2e` out of `verify`, and the `deploy` `needs:` edit it requires.
- `.github/workflows/deploy-shrink.yml`'s own `install-deps` path.
- Trimming `actions/setup-node` from container jobs.
- Any change to `.github/dependabot.yml`.
