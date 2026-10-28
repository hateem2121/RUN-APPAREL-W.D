# A store miss never slower than no store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor whose page or tap is not yet in the shared store waits about as long as if the store did not exist, while a store hit keeps today's speed.

**Architecture:** When a visitor's page or tap misses the store, the default entrypoint in `apps/cms/worker.mjs` waits a short head start for the store's answer, then also draws the page directly (`openNext.fetch`, the path before 24 Oct) and serves whichever answer's headers arrive first. The losing store answer is read to the end in `ctx.waitUntil`, so the store still keeps the page. The race lives in its own module so it can be tested without the Workers runtime.

**Tech Stack:** Cloudflare Workers + Workers Cache (cached `SitePages` entrypoint via `ctx.exports`), OpenNext, Next.js 16.4.3, Vitest, Playwright, Workers Observability (read through the Cloudflare API connector).

**Spec:** `docs/superpowers/specs/2026-10-27-store-misses-design.md` (option A, approved 27 Oct with step 0). Every "why" is there.

Written 28 Oct 2026 at the owner's request ("start the plan now"), from ~1 hour of step-0 logs. Task 0 re-reads those numbers after a full day and is a gate: nothing is built if it fails.

Paths of files this plan creates are written as plain text, not code, so the citation check (`scripts/doc-citations.mjs`) keeps checking only paths that exist.

## Step 0 so far (Workers Observability, CMS Worker, read 28 Oct 07:35 UTC)

| Measure | Value | Gate in the spec |
|---|---|---|
| Store hit, inside the Worker, p95 | taps 7 ms (n=703), pages 42 ms (n=301) | under 300 ms: **pass** |
| Store hit, pages, p99 / max | 777 ms / 62,267 ms | none (noted, see Review Focus 6) |
| A page drawn by `SitePages`, CPU | median 248 ms, p95 1,125 ms; 4,648 drawings in 24 h | — |
| All CMS CPU in 24 h | 3.07 million ms over 52,198 visitor-facing requests (~59 ms each) | — |
| Misses in the hour after a deploy | 256: 204 our warm-up robot, 40 Globalping probes, 12 anyone else | — |
| Extra CPU if only non-robot misses are hedged | ~12 an hour → under 290 a day × 384 ms ≈ 3.6% | under 10%: **pass (estimate)** |
| Extra CPU if robots were hedged too | up to ~40% on a 13-deploy day | **fail** → robots are never hedged |
| Step 0.2 (kept after the caller stops waiting) | 9 of 9, 27 Oct | **pass** |

## Global Constraints

- Only GET requests from a visitor are hedged, for a whole page (`fromSharedStore`) or a tap (`fromTapStore`). Never: HEAD, a fetch-ahead (`next-router-prefetch` present), garment data (`apps/cms/viewerApiCache.mjs`), kept files (sitemap, llms.txt, robots.txt), or a request whose user-agent matches `/run-apparel-store-warmup|globalping/i`.
- Head start: `HEDGE_HEAD_START_MS`, set in Task 0 to the larger of the page and tap hit p95, rounded up to the next 10 ms, never above 300. Today's value would be 50.
- KV off switch: key `store-hedge`, value `off`, read with `cacheTtl: 30`, a failed read leaves the hedge ON (the same shape as `tapStoreOn` in `apps/cms/tapStore.mjs`).
- `Server-Timing` names a hedged miss `page-cache;desc="miss-direct"`.
- The store is still asked from a clean request (`keptRenderRequest`, `tapDrawRequest`); the direct drawing gets the visitor's own request, exactly as the fallback does today.
- Every failure still falls through to drawing; a store error never fails a page.
- `storeAnswerLog` stays timings and states only. CI logs are public: no header value, body or secret is ever printed.
- Budget $5/month. Commands use `npx --yes pnpm@12.15.0`. Branch off `main`; commit messages "Area — what changed" with the Co-Authored-By line.

## Review Focus

1. A store answer that arrives first as a redirect is handled exactly as today: pages hand it to `withRedirectHeaders`, taps fall back to drawing the visitor's request (Task 3).
2. The direct drawing throws or answers 5xx while the store is still drawing: the visitor waits for the store instead of getting the error (Task 1).
3. Both lose: the store throws AND the direct drawing throws: the caller gets `null` and draws the page as today, so the visitor's experience is never worse than before the store (Task 1).
4. The store's losing answer is read to the end inside `ctx.waitUntil`, whose 30 s is shared by everything else that request waits on (Cloudflare "Context", read 28 Oct). A drawing slower than ~25 s is simply not kept: logged, not retried (Task 1).
5. A store hit that is slow (pages p99 777 ms) is hedged; whichever answer starts first wins, and the losing direct drawing is cancelled, never served late (Task 1).

---

### Task 0: Re-read step 0 with a full day of logs (gate)

**Files:** none changed. Results go into the spec's "Step 0 results" in Task 5.

- [ ] **Step 1:** From 29 Oct 06:45 UTC (24 h after the logging deploy), query the CMS Worker's logs as on 28 Oct: `storeAnswer` × `state` count, median, p95, p99; the `SitePages` CPU sum and median; all visitor-facing CPU; and misses split by the request's user-agent (join `$metadata.requestId` with the request event, filtering robots by `/run-apparel|globalping/i`, so the 2,000-event limit does not drop them).
- [ ] **Step 2: Decide.** Go only if: hit p95 (pages and taps) ≤ 300 ms, AND (non-robot misses a day × mean `SitePages` CPU) ÷ (all CPU a day) < 10%. Set `HEDGE_HEAD_START_MS` from the rule in Global Constraints.
Expected: both pass. If either fails, stop and ask the owner; do not start Task 1.

### Task 1: The race, as a module the tests can run

**Files:**
- Create: apps/cms/storeHedge.mjs (+ storeHedge.d.mts, the repo's pattern for a `.mjs` a TypeScript test imports)
- Test: apps/cms/src/storeHedge.test.ts

**Interfaces:**
- Produces: `hedgedAnswer({ askStore, drawDirect, headStartMs, waitUntil, setTimer? }): Promise<{ response: Response, winner: 'store' | 'direct' } | null>`.
  - `askStore(): Promise<Response>` resolves when the store's headers arrive.
  - `drawDirect(): Promise<Response>` is called ONLY if the head start passes with no store answer.
  - `waitUntil(promise)` is the request's `ctx.waitUntil`, passed bound (Cloudflare: destructuring `ctx` throws "Illegal invocation").
  - `setTimer` defaults to `setTimeout`; tests pass fake timers.
- Produces: `HEDGE_HEAD_START_MS` (number, from Task 0).

- [ ] **Step 1: Write the failing tests** (fake timers; each fake answer is a real `Response` whose body is a `ReadableStream`, so "read to the end" and "cancelled" are observable):
  - `a store hit inside the head start is served and nothing is drawn`: store 5 ms, head start 50 → winner `store`, `drawDirect` called 0 times.
  - `the production shape: a 2 s store and a 300 ms drawing reach the visitor in under 500 ms` (the spec's required test): head start 50 → winner `direct`, resolved at ≤ 360 ms of fake time; the store's promise was handed to `waitUntil` and its body was read to the end when it arrived at 2,000 ms.
  - `a store answer that starts before the drawing wins, and the drawing is cancelled`: store 120 ms, drawing 300 ms → winner `store`, the drawing's body cancelled.
  - `a drawing that throws leaves the visitor waiting for the store`: drawing rejects at 100 ms, store 2,000 ms → winner `store`.
  - `a drawing that answers 500 does not beat a store still drawing`: drawing 500 at 100 ms, store 200 at 2,000 ms → winner `store`, the 500's body cancelled.
  - `the store failing after the head start leaves the drawing`: store rejects at 80 ms → winner `direct`.
  - `both failing returns null`: store and drawing reject → `null`.
  - `the store failing inside the head start returns null without drawing`: store rejects at 10 ms → `null`, `drawDirect` 0 times (the caller draws, as today: one drawing, not two).
- [ ] **Step 2: Run:** `npx --yes pnpm@12.15.0 --filter @run-apparel/cms exec vitest run src/storeHedge.test.ts`. Expected: FAIL, the module does not exist.
- [ ] **Step 3: Implement `hedgedAnswer`** in apps/cms/storeHedge.mjs. A losing store answer: `waitUntil(answer.then((r) => r.body?.pipeTo(new WritableStream())))`, its error caught and logged. A losing drawing: `body?.cancel()`. A drawing whose status ≥ 500 counts as "no answer yet" while the store is pending.
- [ ] **Step 4: Run** the same command. Expected: 8 passed.
- [ ] **Step 5: Commit:** "Website — a store miss is raced against a direct drawing after a short head start (module and tests)".

### Task 2: Who is hedged, and the off switch

**Files:**
- Modify: apps/cms/storeHedge.mjs
- Test: apps/cms/src/storeHedge.test.ts

**Interfaces:**
- Produces: `hedgeable(request: Request): boolean` and `hedgeOn(kv): Promise<boolean>`.
- Consumes: nothing from Task 1.

- [ ] **Step 1: Write the failing tests:**
  - `hedgeable`: true for `GET https://wear-run.com/guides` and `GET /journal/some-post` with a browser user-agent; false for HEAD; false with `next-router-prefetch: 1`; false for user-agents `run-apparel-store-warmup/1.0` and `globalping probe (https://github.com/jsdelivr/globalping)`; false for `/wp-login.php`, `/.env`, `/a/b/c/d` (a path with a dot, or more than three segments, or anything but lower-case words, digits and hyphens).
  - `hedgeOn`: false only for the KV value `off`; true for `null`, any other value, and a KV read that throws.
- [ ] **Step 2: Run** `… vitest run src/storeHedge.test.ts`. Expected: the new tests FAIL (not exported).
- [ ] **Step 3: Implement.** The path rule is `/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+){0,2})?\/?$/`.
- [ ] **Step 4: Run.** Expected: all pass.
- [ ] **Step 5: Commit:** "Website — only a visitor's page or tap is ever drawn twice; robots, fetch-aheads and scanners never are".

### Task 3: Use the race in the Worker

**Files:**
- Modify: `apps/cms/worker.mjs` (`fromSharedStore`, `fromTapStore`)
- Modify: `apps/cms/pageCache.mjs` (`pageCacheTiming` accepts `miss-direct`; `storeAnswerLog` unchanged in shape)
- Test: `apps/cms/src/pageCache.test.ts` (source guards, as for `fromTapStore` today)

**Interfaces:**
- Consumes: `hedgedAnswer`, `hedgeable`, `hedgeOn`, `HEDGE_HEAD_START_MS` (Tasks 1–2).
- Produces: `{ state: 'miss-direct', response }` from `fromSharedStore`/`fromTapStore` when the drawing wins; the existing nonce and redirect handling in the default `fetch` applies unchanged.

- [ ] **Step 1: Write the failing tests** in pageCache.test.ts:
  - `pageCacheTiming('miss-direct')` returns `page-cache;desc="miss-direct"`.
  - Source guard: in `fromSharedStore` and `fromTapStore`, the store is asked through `hedgedAnswer(`, only after `hedgeable(request)` and `await hedgeOn(env.SITE_CACHE)`; `drawDirect` is `() => openNext.fetch(request, env, ctx)`; the existing `redirect: 'manual'` guard still matches the `store.fetch(` call; `waitUntil: (p) => ctx.waitUntil(p)`.
  - Source guard: a `miss-direct` answer logs `storeAnswerLog('<kind>', 'miss-direct', …)`.
- [ ] **Step 2: Run** `… vitest run src/pageCache.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** When not hedgeable or the switch is off, the code path is today's, unchanged.
- [ ] **Step 4: Run** the file, then `npx --yes pnpm@12.15.0 --filter @run-apparel/cms exec opennextjs-cloudflare build && node scripts/check-cms-worker-size.mjs` (the stricter build: apps/cms/CLAUDE.md). Expected: pass, Worker size under its gate.
- [ ] **Step 5: Commit:** "Website — a visitor's page or tap that misses the store is drawn directly after the head start".

### Task 4: The scripts read the new label

**Files:**
- Modify: `scripts/warm-shared-store.mjs`, `scripts/warm-regions.mjs`, `apps/cms/scripts/measure-taps.mjs` (the three `desc="(hit|miss|skip)"` patterns)
- Test: `apps/cms/src/measureTaps.test.ts` and the two warm-up scripts' existing tests

- [ ] **Step 1: Write the failing tests:** each reader turns `page-cache;desc="miss-direct"` into the state `miss-direct` (today it reads as no state at all); `measure-taps` counts `miss-direct` as a MISS row, never a warm one.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement:** `desc="(hit|miss-direct|miss|skip)"` (the longer word first).
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit:** "Speed — the warm-ups and the tap measure name a hedged miss".

### Task 5: Prove it, then ship

- [ ] **Step 1:** Every gate in CI's order: `node .claude/skills/gates/run-gates.mjs`, output to a file, unfiltered.
- [ ] **Step 2:** Local proof in `opennextjs-cloudflare preview` is not possible (a local preview keeps nothing, apps/cms/CLAUDE.md), so the race is proven by Task 1's tests and on the live site after deploy.
- [ ] **Step 3:** Record the Task 0 numbers in the spec's "Step 0 results"; open the PR (Auto-fix and auto-merge on, never archive), with the rxps/wine before-capture taken first.
- [ ] **Step 4: After the deploy, the judge** (spec, "How we will know it worked"):
  - From this Mac, `measure-taps` on the first asks after the deploy: miss rows p75 ≤ store-bypassed p75 + `HEDGE_HEAD_START_MS` + 100 ms; hit rows within 20 ms of the run before.
  - Workers logs: `miss-direct` lines appear for visitors and never for the warm-up robot or Globalping.
  - CPU per request (the 28 Oct method) up by under 10% after 24 h.
  - After 7 days: real visitors' taps over 0.4 s fall from 42% (31 of 74, 27 Oct) to under 15%.
- [ ] **Step 5:** If the hits got slower or CPU rose 10% or more: KV `store-hedge` = `off` (no deploy needed), then tell the owner.
- [ ] **Step 6:** Option D (warm London, Muscat and Singapore too) starts only after this 7-day read, so each change is credited with what it did (spec, settled point 5).

## Rulings in this plan (the owner accepted all four on 28 Oct)

1. **Robots are never hedged** (not in the spec). Measured: 244 of 256 misses in the hour after a deploy were our own warm-up robot and Globalping probes; hedging them would draw each page twice for no reader and could cost ~40% more CPU on a busy deploy day. Cost if wrong: our warm-ups stay as slow as today, which nobody waits for.
2. **"Paths the site knows" is a shape, not a list** (the spec said "the sitemap's pages plus the journal and case-study patterns"). The site's pages are listed across six TypeScript files the Worker cannot import, and a copied list would drift. The shape rule (lower-case words, digits and hyphens, up to three segments, no dot) keeps out the scanner paths seen in the logs (`.php`, `.env`). Cost if wrong: a made-up path of that shape is drawn twice once, then answered 404 as today.
3. **A direct 5xx never beats a store still drawing** (not in the spec): the store's answer is the one the site would have given anyway.
4. **The head start would be 50 ms today** (pages' hit p95 42 ms), not the spec's guessed 150 ms; Task 0 sets it from a full day.
