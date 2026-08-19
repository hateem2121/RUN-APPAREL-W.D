# Clearing the "Security and quality 17" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take every open security alert and issue on `RUN-APPAREL/run-apparel-viewer` to zero, fixing what is fixable and formally recording what is not, without weakening a single gate.

**Architecture:** Nine independent code fixes plus one workflow-config fix, delivered on one branch as one pull request, followed by a post-merge pass that attempts dependency overrides, re-checks Dependabot, and closes what remains. Each code fix is proved by breaking the thing it guards and watching the test fail before believing the fix.

**Tech Stack:** pnpm 10.33.0 workspaces, TypeScript 7 (`lib: ES2022`), Vitest 4, Node 24.18.1, Cloudflare Workers + Containers, GitHub Actions, CodeQL default setup (`extended` suite).

**Design spec:** `docs/superpowers/specs/2026-08-19-security-quality-17-design.md`

## Global Constraints

- **`pnpm` is not on PATH.** Every `pnpm <x>` below means `npx --yes pnpm@10.33.0 <x>`. Bare `pnpm` exits **127**.
- **Never lower a coverage threshold** in `vitest.coverage.mjs` to go green. They are measured, not chosen.
- **No CodeQL query-suite downgrade and no test-file exclusions.** The `extended` suite stays.
- **Do not push twice in a row.** `ci.yml` sets `concurrency: cancel-in-progress: true`; a second push kills the first run, and `gh run watch --exit-status` returns 1 for `cancelled` exactly as for `failure`. Check `gh run view <id> --json conclusion -q .conclusion`.
- **`heartbeat.yml` parses `WATCHED` with `IFS=:`.** A cadence label must contain **no colon** or the field silently truncates.
- **Verify docs with `pnpm --filter @run-apparel/cms test`.** `node scripts/doc-citations.mjs` is a module with no main; it exits 0 having checked nothing.
- **Line ranges DO resolve, as of 2026-08-18.** `scripts/doc-citations.mjs:151` strips `:42`, `:42:7` and `:42-80` alike. CLAUDE.md still says ranges never resolve; that is now stale — verified by reading the regex, not the note.
- **If anything fails inexplicably,** run `env | grep -E 'NODE_ENV|PORT'` before reading code.
- **A dismissal is the fallback, never the opener.** Attempt the real fix first in every dependency case.

## Current measured state (2026-08-19T01:30Z)

The five phantom Dependabot alerts **auto-closed at `2026-08-19T01:19Z` with `state: fixed`**, confirming the spec's central claim. Remaining: **3 Dependabot** (`extract-zip` #8, `uuid` #2, `esbuild` #1), **9 code-scanning**, **3 issues** — 12 real items, exactly as the spec named.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/shared/src/variants.ts` | Variant-ID derivation; remove backtracking regex | 1 |
| `apps/shrink/src/containerFailure.ts` | Pure: read a container failure reason (new) | 2 |
| `apps/shrink/src/index.ts` | Worker: use readContainerFailure on the non-OK branch | 2 |
| `apps/shrink/container/server.ts` | Container: stop echoing error text in body | 2 |
| `apps/viewer/scripts/og.test.ts` | Complete comment stripping | 3 |
| `apps/viewer/worker/preview.test.ts` | Complete comment stripping | 3 |
| `apps/viewer/scripts/themeColor.test.ts` | Robust inline-script counting | 4 |
| `apps/viewer/scripts/preload.test.ts` | Complete regex escaping | 5 |
| `scripts/sbom.mjs` | Correct purl encoding | 6 |
| `scripts/import-catalogue-products.mjs` | Refuse non-HTTPS API base | 7 |
| `.github/workflows/heartbeat.yml` | Correct the uptime budget | 8 |
| `package.json` | `pnpm.overrides` for esbuild / uuid | 10 |

---

### Task 1: Polynomial ReDoS in `buildVariantId`

**Files:**
- Modify: `packages/shared/src/variants.ts:52`
- Test: `packages/shared/src/variants.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `buildVariantId(productCode: string, colourSlug: string): string` — unchanged signature and unchanged output for every input. Later tasks do not depend on it.

**Why:** `.replace(/^-+|-+$/g, '')` backtracks at every position on the `-+$` branch, giving O(n²). Sole non-test caller is `apps/cms/src/endpoints/pipelinePlan.ts:65`, which passes a CMS-authored slug — a latent defect, not a live DoS. Fixed because the fix is smaller than the argument against it.

- [ ] **Step 1: Write the failing test** — append to `packages/shared/src/variants.test.ts` inside the existing `describe('buildVariantId', ...)` block

```ts
  it('is linear on a pathological hyphen run — the ReDoS this replaced was O(n^2)', () => {
    const pathological = '-'.repeat(50_000)
    const started = performance.now()
    expect(buildVariantId('N001', pathological)).toBe('N001-')
    expect(performance.now() - started).toBeLessThan(250)
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/shared test -- variants`
Expected: FAIL — the timing assertion exceeds 250 ms on the backtracking regex.

- [ ] **Step 3: Replace the regex with a linear pass**

In `packages/shared/src/variants.ts`, replace the body of `buildVariantId` after the existing comment with:

```ts
  // Split on runs of non-alphanumerics and drop the empty leading/trailing
  // fragments. Equivalent to the old collapse-then-trim pair, but with no
  // backtracking: `/^-+|-+$/g` was O(n^2) on a hyphen run (CodeQL js/polynomial-redos).
  const colour = colourSlug
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .join('-')
  return `${productCode}-${colour}`
```

- [ ] **Step 4: Run the whole variants suite and watch it pass**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/shared test -- variants`
Expected: PASS, including the pre-existing assertions `' navy! '` → `N001-NAVY`, `'--forest--'` → `N001-FOREST`, `'sea/foam'` → `N001-SEA-FOAM`. Those passing unchanged is the proof the rewrite is equivalent.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/variants.ts packages/shared/src/variants.test.ts
git commit -m "fix(shared): buildVariantId trimmed hyphens with a backtracking regex"
```

---

### Task 2: Stack-trace exposure from the shrink container

**Files:**
- Create: `apps/shrink/src/containerFailure.ts`
- Create: `apps/shrink/src/containerFailure.test.ts`
- Modify: `apps/shrink/src/index.ts:264` (Worker — **first**)
- Modify: `apps/shrink/container/server.ts:163` (Container — **second**)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `readContainerFailure(res: Response): Promise<string>`, exported from `apps/shrink/src/containerFailure.ts`. The container's 500 body becomes the fixed string `Shrink failed.`; the detail stays in the `x-shrink-report` header, shape `{ ok: false, error: string }`, base64-encoded.

**Why the order is load-bearing:** the container writes the error into **both** the header and the body. The Worker's non-OK branch reads the **body** and never consults the header — the header is only decoded at `apps/shrink/src/index.ts:268`, reached only when the response *was* OK. Genericising the body first would reduce every container failure to `Container returned 500: `, destroying the diagnostic the whole shrink error path depends on.

**⚠️ Why a new module rather than a test on `index.ts`:** `apps/shrink/src/index.ts` imports `@cloudflare/containers`, which imports `cloudflare:workers` — a module that exists only inside the Workers runtime. Measured: a probe test importing `./index` fails with `Cannot find package 'cloudflare:workers'`. This is the same constraint that put the container's pure half in `container/report.ts` (see the header comment in `apps/shrink/src/containerReport.test.ts`). The pure logic therefore lives in its own module, importing nothing from `index.ts`, so it is testable in plain vitest.

- [ ] **Step 1: Write the failing test** — create `apps/shrink/src/containerFailure.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { readContainerFailure } from './containerFailure'

/**
 * The container's 500 BODY used to echo `error.message`, which CodeQL flagged as
 * js/stack-trace-exposure and which could carry mkdtemp paths. The body is now
 * generic, so the DETAIL has to come from the `x-shrink-report` header — and the
 * Worker's non-OK branch never read that header before this module existed.
 */
describe('readContainerFailure', () => {
  it('prefers the header detail over the generic body', async () => {
    const detail = 'meshopt encoder rejected primitive 4'
    const res = new Response('Shrink failed.', {
      status: 500,
      headers: { 'x-shrink-report': btoa(JSON.stringify({ ok: false, error: detail })) },
    })
    await expect(readContainerFailure(res)).resolves.toBe(detail)
  })

  it('falls back to the body when the header is absent or unparsable', async () => {
    await expect(readContainerFailure(new Response('legacy text', { status: 500 })))
      .resolves.toBe('legacy text')
    await expect(
      readContainerFailure(new Response('legacy text', {
        status: 500,
        headers: { 'x-shrink-report': 'not-base64-json' },
      })),
    ).resolves.toBe('legacy text')
  })

  it('caps the fallback at 500 characters so a huge body cannot flood a log line', async () => {
    const huge = 'x'.repeat(5_000)
    await expect(readContainerFailure(new Response(huge, { status: 500 })))
      .resolves.toHaveLength(500)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/shrink test -- containerFailure`
Expected: FAIL — `Failed to resolve import "./containerFailure"`.

- [ ] **Step 3: Create the module**

Create `apps/shrink/src/containerFailure.ts`:

```ts
/**
 * Reads the reason a shrink container returned a non-OK response.
 *
 * Separate from index.ts on purpose: that file imports @cloudflare/containers,
 * which imports `cloudflare:workers`, so it cannot be loaded in plain vitest —
 * the same reason the container's pure half lives in container/report.ts.
 */

/** The subset of `x-shrink-report` this module needs. */
interface FailureReport {
  ok?: boolean
  error?: string
}

/**
 * The container's 500 body is deliberately generic — it used to echo
 * `error.message`, which CodeQL flagged as js/stack-trace-exposure and which can
 * carry mkdtemp paths. The detail lives in the header, so read that FIRST and keep
 * the body only as the fallback for a container old enough to still send it.
 */
export async function readContainerFailure(res: Response): Promise<string> {
  const header = res.headers.get('x-shrink-report')
  if (header) {
    try {
      const report = JSON.parse(atob(header)) as FailureReport
      if (report?.error) return report.error
    } catch {
      // Unparsable header falls through to the body, below.
    }
  }
  const body = await res.text().catch(() => '')
  return body.slice(0, 500)
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/shrink test -- containerFailure`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it into the Worker**

In `apps/shrink/src/index.ts`, add to the imports at the top:

```ts
import { readContainerFailure } from './containerFailure'
```

Then replace lines 263 to 266 with:

```ts
  if (!containerRes.ok) {
    const detail = await readContainerFailure(containerRes)
    throw new Error(`Container returned ${containerRes.status}: ${detail}`)
  }
```

- [ ] **Step 6: Typecheck the Worker**

Run: `npx --yes pnpm@10.33.0 --filter @run-apparel/shrink typecheck`
Expected: exit 0.

- [ ] **Step 7: Now — and only now — genericise the container body**

In `apps/shrink/container/server.ts`, replace line 163 (`res.end(message)`) with:

```ts
        // Generic on purpose. `message` can carry mkdtemp paths and stack text
        // (CodeQL js/stack-trace-exposure). The full detail is already in the
        // `x-shrink-report` header set above, which the Worker now reads via
        // readContainerFailure() in apps/shrink/src/containerFailure.ts.
        // Do not put it back in the body.
        res.end('Shrink failed.')
```

- [ ] **Step 8: Typecheck the container — it is NOT a pnpm workspace member**

```bash
cd apps/shrink/container && npm install --no-audit --no-fund && npx tsc --noEmit; cd -
```
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/shrink/src/containerFailure.ts apps/shrink/src/containerFailure.test.ts \
        apps/shrink/src/index.ts apps/shrink/container/server.ts
git commit -m "fix(shrink): the 500 body was the only error channel the Worker read"
```

---

### Task 3: Incomplete comment stripping in two tests

**Files:**
- Modify: `apps/viewer/scripts/og.test.ts:31`
- Modify: `apps/viewer/worker/preview.test.ts:261`
- Test: the two files themselves, proved by the break-it protocol in Step 4.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing exported. Both files gain a local `stripComments(source: string): string`.

**Why this is correctness, not cosmetics:** a single `replace(/<!--[\s\S]*?-->/g, '')` pass can leave a comment behind when removal splices new `<!--` out of surrounding text. A surviving comment can satisfy the very `toMatch` the strip exists to protect — a false **pass**. `og.test.ts` documents that exact failure happening once already, in the other direction.

- [ ] **Step 1: Add the helper to `apps/viewer/scripts/og.test.ts`**, replacing line 31

```ts
/**
 * Repeat until stable. One pass is not enough: removing a comment can splice a
 * fresh `<!--` out of the text either side of it, and the survivor could then
 * satisfy the very assertion this strip exists to protect — a false PASS, not a
 * false failure. (CodeQL js/incomplete-multi-character-sanitization.)
 */
function stripComments(source: string): string {
  let previous: string
  let current = source
  do {
    previous = current
    current = current.replace(/<!--[\s\S]*?-->/g, '')
  } while (current !== previous)
  return current
}

const html = stripComments(rawHtml)
```

- [ ] **Step 2: Apply the same helper in `apps/viewer/worker/preview.test.ts`**, replacing lines 261 to 264

```ts
/**
 * Repeat until stable — same reason as scripts/og.test.ts: one pass can leave a
 * comment behind, and a survivor can satisfy the assertion below, passing when it
 * should fail. (CodeQL js/incomplete-multi-character-sanitization.)
 */
function stripComments(source: string): string {
  let previous: string
  let current = source
  do {
    previous = current
    current = current.replace(/<!--[\s\S]*?-->/g, '')
  } while (current !== previous)
  return current
}

const html = stripComments(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8'),
)
```

- [ ] **Step 3: Run both suites and watch them pass**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test -- og preview
```
Expected: PASS.

- [ ] **Step 4: PROVE they can still fail — delete a meta tag**

```bash
cp apps/viewer/index.html /tmp/index.html.bak
perl -0pi -e 's{<meta property="og:title"[^>]*>}{}' apps/viewer/index.html
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test -- og preview
```
Expected: **FAIL** in both files. A changed test that cannot be made to fail is a regression, not a fix. Then restore:

```bash
cp /tmp/index.html.bak apps/viewer/index.html
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test -- og preview
```
Expected: PASS again.

- [ ] **Step 5: Commit**

```bash
git add apps/viewer/scripts/og.test.ts apps/viewer/worker/preview.test.ts
git commit -m "fix(viewer): one-pass comment stripping could pass a test that should fail"
```

---

### Task 4: Inline-script counting misses `<SCRIPT>` and `<script >`

**Files:**
- Modify: `apps/viewer/scripts/themeColor.test.ts:62`

**Interfaces:**
- Consumes: nothing. `html` is the raw `index.html` read at `apps/viewer/scripts/themeColor.test.ts:23` — deliberately **not** comment-stripped in this file.
- Produces: nothing exported.

**Why:** the CSP is hash-based with no `unsafe-inline`, so a second inline `<script>` block means a second hash `gen-headers` must carry. The literal `/<script>/g` misses `<SCRIPT>` and `<script >`, so a second inline script could be added without the count moving — the test would pass while the CSP silently broke. Measured: `apps/viewer/index.html` has exactly three script tags — one bare at line 103, two with attributes at 130 and 138 — so the correct count is and stays **1**.

- [ ] **Step 1: Replace line 62**

```ts
    // `<script` + optional whitespace + `>` — an inline block carries no attributes,
    // so the attributed tags (type="module" src=...) still do not match. Case-
    // insensitive and whitespace-tolerant because `<SCRIPT>` and `<script >` are
    // the same tag to a browser and were invisible to the old literal
    // (CodeQL js/bad-tag-filter).
    const inlineScripts = [...html.matchAll(/<script\s*>/gi)]
```

- [ ] **Step 2: Run it and watch it pass with the count unchanged**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test -- themeColor
```
Expected: PASS, `toHaveLength(1)` unchanged.

- [ ] **Step 3: PROVE it can still fail — add a second inline script**

```bash
cp apps/viewer/index.html /tmp/index.html.bak
perl -0pi -e 's{</head>}{<script >console.log(1)</script>\n  </head>}' apps/viewer/index.html
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test -- themeColor
```
Expected: **FAIL** with "a second inline script would add a second CSP hash". Note this variant (`<script >`) is one the **old** regex would have missed entirely — so this break also demonstrates the bug being fixed. Restore:

```bash
cp /tmp/index.html.bak apps/viewer/index.html
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test -- themeColor
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/viewer/scripts/themeColor.test.ts
git commit -m "fix(viewer): a second inline <SCRIPT> would not have moved the CSP hash count"
```

---

### Task 5: Incomplete regex escaping in the preconnect test

**Files:**
- Modify: `apps/viewer/scripts/preload.test.ts:67`

**Interfaces:**
- Consumes: `SOURCE_INDEX`, defined at `apps/viewer/scripts/preload.test.ts:27`.
- Produces: nothing exported. Adds a local `escapeRegex(literal: string): string`.

**Why `RegExp.escape()` is NOT used here:** it exists in this machine's Node 24.18.1 — verified by executing it — but every workspace pins `"lib": ["ES2022"]` and TypeScript rejects it at that target with `TS2550: Property 'escape' does not exist on type 'RegExpConstructor'`, verified by compiling a probe. `ES2022` is a compatibility floor for shipped viewer code; it is not raised to satisfy one test file.

- [ ] **Step 1: Add the helper above the `describe` block**

```ts
/**
 * Escapes every regex metacharacter, not just `.`. The old `host.replace(/\./g, '\\.')`
 * was correct for today's two literal hostnames and wrong for anything else
 * (CodeQL js/incomplete-sanitization). RegExp.escape() would be the modern form and
 * EXISTS in Node 24, but every workspace pins lib: ES2022 and tsc rejects it there
 * with TS2550 — measured, not assumed. ES2022 is a shipped-browser floor; it stays.
 */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
```

- [ ] **Step 2: Replace line 67**

```ts
      const tag = new RegExp(`<link[^>]*rel="preconnect"[^>]*${escapeRegex(host)}[^>]*>`)
```

- [ ] **Step 3: Run it and watch it pass**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test -- preload
```
Expected: PASS.

- [ ] **Step 4: PROVE it can still fail — strip a `crossorigin`**

```bash
cp apps/viewer/index.html /tmp/index.html.bak
perl -0pi -e 's{(<link[^>]*rel="preconnect"[^>]*cms\.wear-run\.help[^>]*?)\s+crossorigin}{$1}' apps/viewer/index.html
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test -- preload
```
Expected: **FAIL** with the "missing crossorigin" message. Restore:

```bash
cp /tmp/index.html.bak apps/viewer/index.html
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test -- preload
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/viewer/scripts/preload.test.ts
git commit -m "fix(viewer): preconnect host escaping covered dots only"
```

---

### Task 6: purl encoding replaces only the first `@`

**Files:**
- Modify: `scripts/sbom.mjs:90`
- Test: `apps/cms/src/sbom.test.ts` — the SBOM tests live there, not beside the script.

**Interfaces:**
- Consumes: `toCycloneDx(report, meta)`, exported at `scripts/sbom.mjs:79`.
- Produces: unchanged signature. Emits `purl: "pkg:npm/%40scope/name@version"` for scoped packages and `pkg:npm/name@version` for unscoped.

**Why:** `pkg.name.replace('@', '%40')` takes a **string** first argument, so it substitutes only the first occurrence. Correct for today's scoped names, which carry exactly one `@`, and wrong the moment that stops holding — in the one file whose entire output is what vulnerability scanners match on.

- [ ] **Step 1: Replace line 90**

```ts
          // purl spec: only the leading `@` of a scope is percent-encoded, and the
          // `/` separating scope from name is NOT. `.replace('@', …)` took a string,
          // so it substituted the FIRST occurrence only — correct today by accident
          // (CodeQL js/incomplete-sanitization).
          purl: `pkg:npm/${pkg.name.startsWith('@') ? `%40${pkg.name.slice(1)}` : pkg.name}@${version}`,
```

- [ ] **Step 2: Verify both shapes**

```bash
node --input-type=module -e "
import { toCycloneDx } from './scripts/sbom.mjs'
const out = toCycloneDx({ MIT: [
  { name: '@payloadcms/ui', versions: ['3.88.0'] },
  { name: 'sharp', versions: ['0.35.3'] },
]}, { timestamp: 't', serialNumber: 's' })
const purls = out.components.map(c => c.purl)
console.log(purls)
if (purls[0] !== 'pkg:npm/%40payloadcms/ui@3.88.0') throw new Error('scoped purl wrong')
if (purls[1] !== 'pkg:npm/sharp@0.35.3') throw new Error('unscoped purl wrong')
console.log('OK')
"
```
Expected: prints both purls then `OK`.

- [ ] **Step 3: Run the SBOM licence-policy gate that `pnpm test` includes**

```bash
npx --yes pnpm@10.33.0 test 2>&1 | tail -20
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/sbom.mjs
git commit -m "fix(sbom): purl encoding substituted only the first @"
```

---

### Task 7: Catalogue import would POST file data and an API key over HTTP

**Files:**
- Modify: `scripts/import-catalogue-products.mjs:58`

**Interfaces:**
- Consumes: `API_BASE`, derived at `scripts/import-catalogue-products.mjs:58` from `process.env.CMS_API_BASE`.
- Produces: nothing exported. The script now exits `2` before any request when the base is not `https://`.

**Why:** rows read from `catalogue-products.json` are POSTed to `${API_BASE}${pathname}` with `Authorization: users API-Key …`. An operator exporting `CMS_API_BASE=http://…` sends the catalogue **and the key** in cleartext, and nothing says so (CodeQL `js/file-access-to-http`, two instances). `docs/RUNBOOK.md` documents only https origins for this variable, so no localhost exemption — that would be speculative.

- [ ] **Step 1: Insert immediately after line 59 (`const API_KEY = …`)**

```js
// Rows from catalogue-products.json and the API key below both travel in every
// request. `CMS_API_BASE` is operator-supplied, so an http:// value would put both
// on the wire in cleartext with nothing to say so (CodeQL js/file-access-to-http).
// No localhost exemption: docs/RUNBOOK.md documents only https origins for this.
if (!API_BASE.startsWith('https://')) {
  console.error(`CMS_API_BASE must be https:// — got "${API_BASE}"`)
  process.exit(2)
}
```

- [ ] **Step 2: Prove it refuses http and still accepts https**

```bash
CMS_API_BASE=http://example.invalid node scripts/import-catalogue-products.mjs --limit 1; echo "exit=$?"
```
Expected: prints the error, `exit=2`.

```bash
CMS_API_BASE=https://cms.wear-run.help node scripts/import-catalogue-products.mjs --limit 1 2>&1 | head -3; echo "exit=$?"
```
Expected: proceeds past the guard (a dry run — `--apply` is absent, so nothing is written).

- [ ] **Step 3: Commit**

```bash
git add scripts/import-catalogue-products.mjs
git commit -m "fix(scripts): catalogue import accepted an http:// CMS base"
```

---

### Task 8: The heartbeat budget that makes issue #31 re-fire daily

**Files:**
- Modify: `.github/workflows/heartbeat.yml:84`
- Modify: `.github/workflows/heartbeat.yml:75` through the comment block ending at line 79
- Test: `apps/cms/src/workflowHardening.test.ts` (existing gate)

**Interfaces:**
- Consumes: nothing.
- Produces: the `WATCHED` line for `uptime.yml` becomes `uptime.yml:36:daily at 0723 UTC`.

**Why, with the arithmetic:** `uptime.yml` now carries a single `cron: '23 7 * * *'` — daily — after the `*/15` cadence billed ~1,200 of the 2,000 free Actions minutes a month and the exhausted quota **stopped a production deploy** (`docs/RUNBOOK.md`, "Uptime alerts"). `heartbeat.yml` still budgets it at **3 hours**. A daily job breaches three hours every single day, so **#31 re-opens forever** — and a monitor that cries wolf daily is one nobody reads, which is the precise failure this workflow's own header was written to prevent.

**Why 36 and not the spec's 30:** worst measured delivery gap is **6.1 h**, so a daily cron's worst inter-run gap is ~30.1 h. The comparison is `[ "$age_h" -gt "$hours" ]`, which fires at 31 h. A 30 h budget sits one hour from the false alarm we are removing. 36 h leaves ~6 h of headroom and still catches a genuinely dead workflow inside a day and a half, sampled by a job that runs every 6 h.

**⚠️ The label must contain no colon.** The parser is `while IFS=: read -r file hours cadence`, and the file's own comment at line 81 warns a colon is read as an extra field and silently truncates. `daily at 07:23 UTC` would break the watchdog while looking correct. Hence `daily at 0723 UTC`.

- [ ] **Step 1: Replace line 84**

```
          uptime.yml:36:daily at 0723 UTC
```

- [ ] **Step 2: Replace the stale comment at lines 75 to 79 with the current arithmetic**

```yaml
          # ⚠️ uptime.yml is DAILY since 2026-08-18 (cron '23 7 * * *'). At */15 it
          # billed ~1,200 of the 2,000 free Actions minutes a month and the exhausted
          # quota stopped a deploy; liveness moved to the external monitor, which polls
          # every 5 min for no Actions minutes. See docs/RUNBOOK.md → "Uptime alerts".
          #
          # The budget below is 36 h, not 24 h: the worst delivery gap measured here is
          # 6.1 h, so the worst inter-run gap for a daily cron is ~30.1 h, and the test
          # is `-gt`, firing at 31 h. 30 h would sit one hour from a false alarm — which
          # is exactly what this budget being STALE at 3 h produced in issue #31, where
          # a daily workflow breached a 3 h budget every single day.
```

- [ ] **Step 3: Run the workflow-hardening gate**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/cms test -- workflowHardening
```
Expected: PASS. It checks the top-level `permissions:` block survives (it must keep `contents` — its absence 404s checkout on this private repo), that `timeout-minutes` remains, and that no `${{ github.event.* }}` entered a `run:` block.

- [ ] **Step 4: PROVE the parser still reads three fields**

```bash
printf 'uptime.yml:36:daily at 0723 UTC\n' | while IFS=: read -r file hours cadence; do
  echo "file=[$file] hours=[$hours] cadence=[$cadence]"
done
```
Expected: `file=[uptime.yml] hours=[36] cadence=[daily at 0723 UTC]` — three fields, cadence intact. Contrast with the colon form:

```bash
printf 'uptime.yml:36:daily at 07:23 UTC\n' | while IFS=: read -r file hours cadence; do
  echo "file=[$file] hours=[$hours] cadence=[$cadence]"
done
```
Expected: cadence reads `daily at 07` — the truncation this step exists to avoid.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/heartbeat.yml
git commit -m "fix(ci): heartbeat budgeted a daily uptime job at three hours"
```

---

### Task 9: Full gate run, in CI's order

**Files:** none modified.

- [ ] **Step 1: Check the environment before believing any failure**

```bash
env | grep -E '^(NODE_ENV|PORT)=' || echo "neither set — good"
```

- [ ] **Step 2: Run every gate**

```bash
npx --yes pnpm@10.33.0 install --frozen-lockfile
npx --yes pnpm@10.33.0 lint
npx --yes pnpm@10.33.0 typecheck
npx --yes pnpm@10.33.0 test:coverage
bash scripts/test-alert-shell.sh
npx --yes pnpm@10.33.0 seed:assets && npx --yes pnpm@10.33.0 build
node scripts/check-bundle-budget.mjs
npx --yes pnpm@10.33.0 eval:artwork
```
Expected: all exit 0. `check-bundle-budget.mjs` reads `apps/viewer/dist` and exits 1 unless `build` ran first. Do **not** lower any coverage threshold to pass.

- [ ] **Step 3: Container typecheck — invisible from the workspace**

```bash
cd apps/shrink/container && npm install --no-audit --no-fund && npx tsc --noEmit; cd -
```
Expected: exit 0.

- [ ] **Step 4: Doc-citation gate for the spec and this plan**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/cms test
```
Expected: PASS. This is the gate; `node scripts/doc-citations.mjs` checks nothing.

---

### Task 10: Attempt the two fixable dependency alerts

**Files:**
- Modify: `package.json:17` (`pnpm.overrides`)

**Interfaces:**
- Consumes: the existing `pnpm.overrides` block, which already carries `sharp`, `tmp`, `postcss`, `dompurify`, `undici` and three `brace-expansion` majors.
- Produces: two additional override entries, **only if they survive the gates**.

**Why attempt before dismissing:** a dismissal that could have been a patch is a lie told to the next session.

**⚠️ The cooldown hides failure.** `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`. A too-fresh version is **not an error** — the install exits 0 and leaves the old version in place. Verify by reading the lockfile, never by trusting the exit code.

- [ ] **Step 1: Add both overrides to `package.json`**

```json
      "@esbuild-kit/core-utils>esbuild": "^0.25.0",
      "@lhci/cli>uuid": "^11.1.1",
```

- [ ] **Step 2: Install and read the lockfile, not the exit code**

```bash
npx --yes pnpm@10.33.0 install --no-frozen-lockfile
grep -oE '(^|/)esbuild@0\.(18|1[0-9]|2[0-4])\.[0-9]+' pnpm-lock.yaml | sort -u
grep -oE '(^|/)uuid@[0-9]+\.[0-9]+\.[0-9]+' pnpm-lock.yaml | sort -u
```
Expected: the first grep prints nothing (no esbuild below 0.25 remains); the second prints no `uuid@8.x`.

- [ ] **Step 3: Prove the overrides did not break the build or Lighthouse**

```bash
npx --yes pnpm@10.33.0 build
npx --yes pnpm@10.33.0 exec lhci --version
```
Expected: both exit 0. **If either fails, revert that one override** and record it for dismissal in Task 12:

```bash
git checkout -- package.json pnpm-lock.yaml && npx --yes pnpm@10.33.0 install --frozen-lockfile
```

- [ ] **Step 4: Commit whichever overrides survived**

```bash
git add package.json pnpm-lock.yaml
git commit -m "fix(deps): lift the two transitive advisories that had reachable patches"
```

---

### Task 11: Open the pull request and merge it

**Files:** none modified.

- [ ] **Step 1: Push once — and only once**

```bash
git push -u origin fix/security-quality-17
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "Clear the security-and-quality alerts" --body "$(cat <<'BODY'
Takes the open alerts to zero. Design: `docs/superpowers/specs/2026-08-19-security-quality-17-design.md`.

Five of the original 17 were phantoms — already patched, and they auto-closed at
2026-08-19T01:19Z with `state: fixed` while this branch was being written. What
remained was 9 code-scanning alerts, 3 dependency alerts and 3 issues.

Two findings changed the work rather than decorating it:

- Genericising the shrink container's 500 body alone would have blinded the whole
  error path — `apps/shrink/src/index.ts:263` read the BODY, and the header holding
  the detail is only decoded on the OK branch. The Worker learns the header first,
  in the same commit.
- `RegExp.escape()` exists in Node 24.18.1 (verified by running it) but tsc rejects
  it under this repo's `lib: ES2022` with TS2550 (verified by compiling a probe).
  ES2022 is a shipped-browser floor, so the fix uses the complete-escape idiom.

No gate was weakened: the CodeQL `extended` suite stays, no test files were excluded
from scanning, and no coverage threshold moved. Every changed test was proved still
able to fail by breaking the property it guards.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 3: Wait for CI, then read `conclusion` — not the exit code**

```bash
gh pr checks --watch
gh run list --branch fix/security-quality-17 --limit 1 --json databaseId,conclusion
```
Expected: `conclusion: success`. A `cancelled` conclusion means a second push killed the run or a job hit its own `timeout-minutes` — it does **not** mean a failure.

- [ ] **Step 4: Merge**

```bash
gh pr merge --squash --delete-branch
```

---

### Task 12: Post-merge — re-check, dismiss, close

**Files:** none modified.

- [ ] **Step 1: Wait for Dependabot to re-evaluate the merged lockfile, then re-count**

```bash
gh api "repos/RUN-APPAREL/run-apparel-viewer/dependabot/alerts?state=open&per_page=100" \
  --jq '.[] | "#\(.number) \(.dependency.package.name)"'
```
Expected: `esbuild` and `uuid` gone if their overrides survived Task 10; `extract-zip` #8 remains regardless — no patched release exists.

- [ ] **Step 2: Re-count code-scanning after the weekly scan re-runs**

```bash
gh api "repos/RUN-APPAREL/run-apparel-viewer/code-scanning/alerts?state=open&per_page=100" \
  --jq '.[] | "#\(.number) \(.rule.id) \(.most_recent_instance.location.path)"'
```
Expected: 0. **If a rewrite did not satisfy CodeQL** — possible; the rule predicates are not fully documented — iterate on that specific regex rather than dismissing it, and re-run.

- [ ] **Step 3: Show the owner each dismissal reason before sending it**

Per the owner's decision, dismissals are performed from this session, one at a time, with the reason shown first. Reason text is fixed in the design doc. For `extract-zip`:

```bash
gh api -X PATCH "repos/RUN-APPAREL/run-apparel-viewer/dependabot/alerts/8" \
  -f state=dismissed -f dismissed_reason=tolerable_risk \
  -f dismissed_comment="Reached only through @lhci/cli -> lighthouse -> puppeteer-core -> @puppeteer/browsers, a CI-only devDependency that never ships to users and never runs against untrusted archives. No patched release exists as of 2026-08-19. Owner decision 2026-08-19: retain Lighthouse CI for its performance budget check and accept this knowingly."
```

- [ ] **Step 4: Close issue #31 with the fix, not the button**

```bash
gh issue close 31 --repo RUN-APPAREL/run-apparel-viewer --comment "Fixed rather than dismissed. heartbeat.yml budgeted uptime.yml at 3h with a stale 'scheduled every 15 min' note, but uptime.yml has run cron '23 7 * * *' — daily — since 2026-08-18, when the */15 cadence was billing ~1,200 of the 2,000 free Actions minutes a month and the exhausted quota stopped a deploy. A daily job breaches a 3h budget every single day, so this issue would have re-opened forever. Budget is now 36h: worst measured delivery gap is 6.1h, so the worst inter-run gap for a daily cron is ~30.1h, and the check fires at -gt, i.e. 31h — 30h would have sat one hour from a false alarm."
```

- [ ] **Step 5: Close issue #22 with the measurements**

```bash
gh issue close 22 --repo RUN-APPAREL/run-apparel-viewer --comment "Condition cleared. Measured 2026-08-19: cms /api/health -> 200, viewer.wear-run.help/rxps/wine -> 200. Note the viewer URL in this issue body is the pre-rename n001 path, which returns 200 from an SPA regardless of whether the product exists — the rxps probe is the one carrying information."
```

- [ ] **Step 6: Inspect `route-unparsed` before closing #19**

```bash
gh issue view 19 --repo RUN-APPAREL/run-apparel-viewer --json body --jq .body
```
If the recorded reasons are apex or crawler paths, close as informational. **If any is a real product URL, that is a separate defect** — open its own issue rather than absorbing it here.

- [ ] **Step 7: Final count — the success criteria**

```bash
printf "dependabot open: "; gh api "repos/RUN-APPAREL/run-apparel-viewer/dependabot/alerts?state=open&per_page=100" --jq 'length'
printf "code-scanning open: "; gh api "repos/RUN-APPAREL/run-apparel-viewer/code-scanning/alerts?state=open&per_page=100" --jq 'length'
printf "issues open: "; gh issue list --repo RUN-APPAREL/run-apparel-viewer --state open --json number --jq 'length'
```
Expected: `0`, `0`, `0`.

---

## Success criteria

1. GitHub reports **0 open** Dependabot alerts and **0 open** code-scanning alerts.
2. Every alert not closed by a code change carries a written, specific dismissal reason, reproduced in the design doc.
3. Issues #19, #22, #31 closed — **#31 by a fix**, proved by `heartbeat.yml` no longer being able to breach its budget on a daily cadence.
4. Every gate in Task 9 exits 0, including the three invisible ones.
5. Every changed test demonstrated to fail when the property it guards is broken.
