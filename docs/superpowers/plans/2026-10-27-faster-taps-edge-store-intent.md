# Faster taps on wear-run.com — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tap between website pages shows the new page in under 0.4 s (3 in 4), and a product card's garment loading screen starts to lift within 1.5 s, measured from Pakistan.

**Architecture:** The CMS Worker's shared store (Workers Cache in front of `SitePages`) also keeps Next.js tap data, one copy per destination. Website links prefetch the whole page on hover, focus or touch, and garment cards warm their data through a same-origin address. A free warming pipeline (CI runner, Globalping probes, D1 read replicas) and a weekly measurement keep it fast.

**Tech Stack:** Cloudflare Workers + Workers Cache, OpenNext 1.20.13, Next.js 16.4.3 (App Router), React 19.3, Payload 3.92 on D1, Playwright 1.64, Vitest 5, GitHub Actions, Globalping API.

**Spec:** `docs/superpowers/specs/2026-10-27-faster-taps-edge-store-intent-design.md`. Read it first; every "why" lives there.

Paths of files this plan creates are written as plain text, not code, so the repository's citation check (`scripts/doc-citations.mjs`, which reads only code spans) keeps checking the paths that already exist.

## Global Constraints

- The admin (`cms.wear-run.help/admin`) is untouched. Tap data is kept only for host `wear-run.com`.
- The website's `connect-src` in `apps/cms/publicViewerHeaders.mjs` stays exactly as it is.
- Never `prerender`; speculation rules use `prefetch` with eagerness `conservative`, on `/products/*/*` only.
- Nothing is fetched ahead when `navigator.connection.saveData` is true, and no 3D model is ever fetched ahead.
- `_rsc` codes use Next 16.4.3's current format: SHA-256 of `prefetch,segmentPrefetch,stateTree,nextUrl` (absent = `0`), first 12 bytes, base64url without padding. The legacy 5-character format is never kept.
- Kept tap copies carry `Cache-Tag: site-pages` (`KEPT_TAGS.pages`) and the pages' lifetime (`KEPT_CACHE_CONTROL`).
- The added `Vary` on kept tap copies is exactly `rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch`.
- KV off switch: key `rsc-store`, value `off`, read with `cacheTtl: 30`.
- `NAV_PROGRESS_DELAY_MS` becomes `400`.
- Targets: G1 p75 < 400 ms per route per engine (warm store); G2 p75 lift < 1,500 ms per engine (warm data).
- CI logs are public: print timings and store states only, never a header value, code, secret or response body.
- Budget: $5/month total. No paid service. Globalping anonymous tier (250 tests/hour), under 100 tests per deploy.
- Every command uses `npx --yes pnpm@12.6.0`, never bare `pnpm`. Commit messages are "Area — what changed" and end with the Co-Authored-By line. Work on a branch off `main`.

## Review Focus

- A tap to a journal post that does not exist answers 404. That answer is never kept, and the visitor still sees the 404 page (Task 2).
- A visitor signed in to the CMS, or with a draft cookie, is never served a kept copy and never fills one (Task 2).
- A tap to `/products?family=…` (any query besides `_rsc`) is served live, as today (Task 2).
- A copy kept under one deploy is never served under another, so an old build's data never meets new script files (Task 2).
- A visitor in dark mode who taps between pages sees the dark page. Tap data must not depend on the colour-scheme hint (Task 2, step 1; Task 4's browser test runs in dark mode).

---

### Task 1: The measure-taps script and a baseline

**Files:**
- Create: apps/cms/scripts/measure-taps.mjs
- Test: apps/cms/src/measureTaps.test.ts

**Interfaces:**
- Produces:
  - `percentile(values: number[], p: number): number` (nearest-rank).
  - `storeStateOf(serverTiming: string | null): 'hit' | 'miss' | 'skip' | 'none'`, which reads `page-cache;desc="…"` or `api-cache;desc="…"`.
  - `verdict(rows: Array<{route: string, engine: string, ms: number, state: string}>, targetMs: number): {pass: boolean, byRoute: Record<string, {p50: number, p75: number, n: number}>}`, computed per route and engine, using warm (`hit`) taps only.
  - CLI: `node apps/cms/scripts/measure-taps.mjs --origin=https://wear-run.com [--taps=20] [--refuse-store]`. Exits 1 when the verdict fails, 2 when inconclusive (403/429/503).

- [ ] **Step 1: Write failing tests:**
  - `percentile([1,2,3,4], 75) === 3`;
  - `storeStateOf('page-cache;desc="hit"') === 'hit'`;
  - `storeStateOf(null) === 'none'`;
  - `verdict(...)` with four warm 300 ms taps passes at 400 and fails at 250;
  - a `miss` row is excluded from p75 but counted in `n`.
- [ ] **Step 2:** Run `npx --yes pnpm@12.6.0 --filter @run-apparel/cms exec vitest run src/measureTaps.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the three functions and the CLI.** The CLI does the following:
  - Imports `@playwright/test` from apps/cms and blocks `**/*.glb`.
  - For each destination in `['/', '/products', '/about', '/contact', '/faq']` and each engine (Chromium 1440×900, WebKit `iPhone 15`), makes `--taps` taps. Each tap opens a fresh context on a start page that links to the destination.
  - Desktop moves the mouse onto the link 300 ms before clicking. Phone dispatches `touchstart` 100 ms before clicking.
  - Times the click until `location.pathname` changes, and reads the tap's `Server-Timing` from the `_rsc` response.
  - Also measures card → garment opens on `/products`: click until `.preloader` starts to lift.
  - `--refuse-store` adds `cookie: payload-token=probe` to every request, so nothing is served from the store.
- [ ] **Step 4:** Run the unit test again. Expected: PASS.
- [ ] **Step 5: Baseline.** Run three times from this Mac:
  `node apps/cms/scripts/measure-taps.mjs --origin=https://wear-run.com > backups/speed/baseline-$(date +%F)-$N.json`.
  Expected: a JSON per run. `backups/` is gitignored.
- [ ] **Step 6: Negative control.** Run once with `--refuse-store`. Expected: exit 1, every tap `state: 'none'` or `miss`.
- [ ] **Step 7: Commit** — "Speed — a script that measures taps and garment opens on the live site".

### Task 2: Tap-data rules (pure)

**Files:**
- Create: apps/cms/tapStore.mjs
- Test: apps/cms/src/tapStore.test.ts
- Create: apps/cms/src/interceptionRoutes.test.ts

**Interfaces:**
- Consumes (from `apps/cms/pageCache.mjs`): `SITE_HOST`, `KEPT_TAGS`, `keptHeaders`, `servedHeaders`, `KEPT_RENDER_HEADERS`, `STORE_MODE_KEY`, `VERSIONED_MODE`, `CONTENT_VERSION_KEY`, `VERSION_CACHE_SECONDS`.
- Produces:
  - `RSC_STORE_KEY = 'rsc-store'`
  - `TAP_HEADERS = ['rsc','next-router-state-tree','next-router-prefetch','next-router-segment-prefetch']`
  - `TAP_VARY` (the exact string in Global Constraints)
  - `BROWSER_VARY = 'x-run-browser-vary'`
  - `STATE_TREE_MAX_BYTES` (set in Step 1)
  - `rscCode({prefetch?, segmentPrefetch?, stateTree?, nextUrl?}): Promise<string>`
  - `keepableTapRequest(request: Request): Promise<boolean>`
  - `tapDrawRequest(request: Request, cf?: object): Promise<Request>`
  - `keptTapStoreKey(drawUrl: string, deployVersion: string, kv): Promise<string>`, giving `/__kept-rsc/<host>/<deploy>/<content><path>?_rsc=<code>`
  - `keepableTapAnswer(response: Response, text: string): boolean`
  - `keptTapHeaders(headers: HeadersInit): Headers`
  - `servedTapHeaders(headers: HeadersInit): Headers`
  - `tapStoreOn(kv): Promise<boolean>`
  - `stateTreeFor(pathname: string): string | null`, the URL-encoded header a browser sends for a tap to this static page, or null for a path it cannot build.

- [ ] **Step 1: Check before writing code.**
  - Run `rg -n "sec-ch-prefers-color-scheme|headers\(\)" apps/cms/src/app/\(frontend\) apps/cms/src/components/site apps/cms/src/lib`. Expected: no website server code reads the colour hint. If any does, stop and bring it to the owner: the hint would join the key.
  - On the live site, capture `next-router-state-tree` sizes for taps to every page in the sitemap. Use a throwaway Playwright run, kept out of the repo, that clicks a link to each page and records the header's length on the `_rsc` request. Set `STATE_TREE_MAX_BYTES` to twice the largest.
- [ ] **Step 2: Write failing tests in `src/tapStore.test.ts`:**
  - `rscCode` equals Next's own `computeCacheBustingSearchParam` (imported from `next/dist/shared/lib/router/utils/cache-busting-search-param.js`) for: the /products tap (tree from the spec, `nextUrl` `/faq` → `ewbMhPsdg9BCpK4z`); the same without `nextUrl`; a tree prefetch (`prefetch '1'`, segment `/_tree`); and all-absent (`''`).
  - `keepableTapRequest` is true for a GET to `https://wear-run.com/products?_rsc=<rscCode(headers)>` with `rsc: 1` and the tree. It is false for each of:
    - a wrong code;
    - a 5-character code;
    - an extra query (`&family=x`);
    - host `cms.wear-run.help`;
    - path `/admin`;
    - a `next-action` header;
    - cookie `payload-token=x`;
    - a tree longer than `STATE_TREE_MAX_BYTES`;
    - no `rsc` header.
  - `tapDrawRequest` carries exactly `KEPT_RENDER_HEADERS` plus the present `TAP_HEADERS`. It has no `next-url` and no `cookie`, and its `_rsc` equals `rscCode` without `nextUrl`. Codes computed from `/faq` and from `/contact` give one draw URL.
  - `keptTapStoreKey` contains the deploy, and two deploys give two keys. With `page-store-mode` `versioned` the content version is in the key; otherwise it is `live`.
  - `keepableTapAnswer` is true for 200 `text/x-component` with no `set-cookie` and no encoding. It is false for 404, 307, `set-cookie`, `vary: *`, `content-encoding: gzip`, and for a body containing the error row identified in Step 3.
  - `keptTapHeaders` sets `cache-tag: site-pages` and `vary: TAP_VARY`, and keeps the old `vary` in `BROWSER_VARY`. `servedTapHeaders` gives the visitor back the old `vary` and removes the bookkeeping.
  - `tapStoreOn` is false for KV value `off` and true for null or any other value.
  - `stateTreeFor('/products')` equals `encodeURIComponent` of the spec's measured tree. `stateTreeFor('/journal/x')` is null.
- [ ] **Step 3: Find the error marker.**
  - Fetch the tap data of a page with a deliberately thrown error in a local `opennextjs-cloudflare preview`, as `apps/cms/CLAUDE.md` describes. Record the row prefix Next writes for a server error.
  - Add that body to the `keepableTapAnswer` test.
  - Revert the planted error.
- [ ] **Step 4: Write failing `src/interceptionRoutes.test.ts`.** It walks `apps/cms/src/app` and fails if any folder name starts with `(.)`, `(..)` or `(...)`, with a message naming the spec's "Facts" section.
- [ ] **Step 5:** Run `npx --yes pnpm@12.6.0 --filter @run-apparel/cms exec vitest run src/tapStore.test.ts src/interceptionRoutes.test.ts`. Expected: tapStore FAIL (module not found); interceptionRoutes PASS. Then plant a `(.)x` folder: FAIL. Then remove it.
- [ ] **Step 6: Implement apps/cms/tapStore.mjs.** `rscCode` uses `crypto.subtle.digest('SHA-256', …)`, `subarray(0, 12)` and base64url. `stateTreeFor` covers the static pages captured in Step 1. Task 4 adds a browser test that holds it to the browser's real headers.
- [ ] **Step 7:** Run the Step 5 command. Expected: PASS, every case.
- [ ] **Step 8: Commit** — "Website — rules for keeping tap data in the shared store (not yet used)".

### Task 3: Keep tap data in the store; warm it after a deploy

**Files:**
- Modify: `apps/cms/worker.mjs` (`SitePages.fetch`, `fromSharedStore`, the Server-Timing line)
- Modify: `scripts/warm-shared-store.mjs`
- Test: `apps/cms/src/warmSharedStore.test.ts`, `apps/cms/src/pageCache.test.ts`

**Interfaces:**
- Consumes: everything Task 2 produces.
- Produces: `warmTapTargets(pages: string[], origin: string): Promise<Array<{url: string, headers: Record<string,string>}>>` in `scripts/warm-shared-store.mjs`.

- [ ] **Step 1: Write failing tests:**
  - `warmTapTargets(['/', '/products', '/journal/x'], 'https://wear-run.com')` returns two targets (the journal post has no static tree). Each has `rsc: '1'`, the tree from `stateTreeFor`, and `?_rsc=` equal to `rscCode` of those headers.
  - In `pageCache.test.ts`, `keepablePageRequest` still refuses any `rsc` request: the page rule is unchanged, and tap data goes only through tapStore.
- [ ] **Step 2:** Run both test files. Expected: FAIL on `warmTapTargets`.
- [ ] **Step 3: Wire the Worker.**
  - In `fromSharedStore`, when `await keepableTapRequest(asked) && await tapStoreOn(env.SITE_CACHE)`, call `store.fetch(await tapDrawRequest(request, cf), { cf, redirect: 'manual' })` with `cf.cacheKey = await keptTapStoreKey(...)`.
  - In `SitePages.fetch`, a request carrying `rsc` is kept only when `keepableTapAnswer` holds and the render is not spoiled. It is then answered with `keptTapHeaders`, otherwise with `unkeptHeaders`.
  - On the way out use `servedTapHeaders`, and append `page-cache;desc="<state>"` to `Server-Timing` before the `nonceable` early return, so tap answers report their state too.
  - Implement `warmTapTargets`, and request those targets in the existing warm-up's first and second passes.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run `node .claude/skills/gates/run-gates.mjs`. Expected: every gate passes, including `opennextjs-cloudflare build` and `check-cms-worker-size.mjs`.
- [ ] **Step 5: Commit** — "Website — taps between pages are answered from the shared store".
- [ ] **Step 6: Live proof after merge and deploy** (the owner merges; preflight per root `CLAUDE.md`).
  - Tap FAQ → Products twice in fresh browsers. Expected: the second tap's `Server-Timing` is `page-cache;desc="hit"`.
  - Run the measure-taps script three times. Compare with the Task 1 baseline.
  - Set KV `rsc-store` to `off` with the owner's yes, wait 30 s, and expect `none` on taps. Set it back.
  - Time a store miss: tap a page no one has opened since the deploy, against today's live drawing of the same tap. If the miss is more than 100 ms slower, open a follow-up to stream the answer while a second copy is checked (spec, Part 1).
  - Tap to `/journal/does-not-exist`. Expected: the 404 page, and `page-cache;desc="skip"`.
  - After 7 days, count visitor tap-data requests by `page-cache` state in Workers logs (`$workers.entrypoint` empty). Below 50% hits is "low" (spec, "How it is judged"). Report the number either way.

### Task 4: Fetch ahead on intent

**Files:**
- Create: apps/cms/src/lib/intentPrefetch.ts, apps/cms/src/components/site/IntentLink.tsx
- Modify: every website file that imports `next/link`. List them with `rg -l "from 'next/link'" apps/cms/src`; that is 30 on 27 Oct. Leave out `app/(payload)/not-found.tsx`, which is the admin's.
- Test: apps/cms/src/lib/intentPrefetch.test.ts, apps/cms/e2e/intentPrefetch.spec.ts, apps/cms/e2e/tapTree.spec.ts

**Interfaces:**
- Consumes: `stateTreeFor`, `rscCode` (Task 2) in `tapTree.spec.ts`.
- Produces:
  - `shouldPrefetchOnIntent({ href: string, here: URL, saveData: boolean, download: boolean, target: string | null }): boolean`
  - `IntentLink`: the same props as `next/link`. It renders `<Link prefetch={intent ? true : undefined}>` and sets intent on `pointerenter` (mouse only), `focus` and `touchstart` when `shouldPrefetchOnIntent` allows.

- [ ] **Step 1: Write failing unit tests.** True for `/products` from `/faq`. False for each of:
  - another origin;
  - `/products/r-asb/petrol`;
  - `/products/r-asb/petrol?x`;
  - `saveData: true`;
  - `download: true`;
  - `target: '_blank'`;
  - the current page.
- [ ] **Step 2: Write failing browser tests.**
  - `intentPrefetch.spec.ts` (Chromium):
    - on `/faq`, hovering the Products menu link sends one `_rsc` request with no `next-router-prefetch` header before any click;
    - with `navigator.connection.saveData` forced true by an init script, the same hover sends none;
    - a click after the hover arrives without a new `_rsc` request;
    - the spec runs once in `colorScheme: 'dark'`, and the arrived page has the dark theme.
  - `tapTree.spec.ts`: clicking each main-menu link on `/faq` sends `next-router-state-tree` equal to `stateTreeFor(path)`. It fails on a Next upgrade that changes the format.
- [ ] **Step 3:** Run `CI=1 npx --yes pnpm@12.6.0 --filter @run-apparel/cms exec playwright test e2e/intentPrefetch.spec.ts e2e/tapTree.spec.ts`. Expected: intentPrefetch FAIL; tapTree PASS. If tapTree fails, fix `stateTreeFor` first.
- [ ] **Step 4:** Implement `intentPrefetch.ts` and `IntentLink.tsx`, then replace the imports (`import { IntentLink as Link } from '…/IntentLink'`).
- [ ] **Step 5:** Run the unit test and both specs. Expected: PASS. Then run the whole CMS browser suite. Expected: PASS, with `navProgress.spec.ts` unchanged.
- [ ] **Step 6: Commit** — "Website — a link fetches its page ahead when a visitor hovers, focuses or touches it".

### Task 5: Warm a garment's data when its card is touched

**Files:**
- Modify: `apps/cms/viewerApiCache.mjs`, `apps/cms/worker.mjs`
- Create: apps/cms/src/lib/garmentWarm.ts, apps/cms/src/components/site/GarmentWarm.tsx
- Modify: `apps/cms/src/app/(frontend)/layout.tsx` (mount `<GarmentWarm />` beside `<CardOpening />`)
- Test: `apps/cms/src/viewerApiCache.test.ts`, apps/cms/src/lib/garmentWarm.test.ts, apps/cms/e2e/garmentWarm.spec.ts

**Interfaces:**
- Produces:
  - `warmGarmentTarget(url: URL): URL | null` in `viewerApiCache.mjs`. It maps `https://wear-run.com/__warm/garment/<p>/<c>` to `https://cms.wear-run.help/api/public/viewer/<p>/<c>`, and returns null for any other path, host, query or method.
  - `garmentWarmPath(href: string, here: URL): string | null` in `garmentWarm.ts`.
  - The Worker answers `/__warm/garment/…` with `204`, `cache-control: no-store`, and drains the store answer in `ctx.waitUntil`.

- [ ] **Step 1: Write failing tests:**
  - `warmGarmentTarget` maps the address above, and is null for `/__warm/garment/a`, `/__warm/garment/a/b/c`, `?x=1`, host `cms.wear-run.help` and path `/__warm/other`;
  - `garmentWarmPath('/products/r-asb/petrol', here)` gives `/__warm/garment/r-asb/petrol`, and is null for `/products`, another origin, and Save-Data;
  - `garmentWarm.spec.ts`: a `pointerdown` on a product card sends exactly one GET to `/__warm/garment/<p>/<c>`, and a second `pointerdown` sends none.
- [ ] **Step 2:** Run the unit tests and the spec. Expected: FAIL.
- [ ] **Step 3: Implement.** `GarmentWarm.tsx` is a document-level listener (`pointerenter` mouse, `focusin`, `touchstart`, `pointerdown`) on `.product-card a[href]`, like `CardOpening.tsx`. It calls `fetch(path, { keepalive: true, priority: 'low' })` once per path per page view. The Worker route uses `serveViewerApi` with the mapped request.
- [ ] **Step 4:** Run the tests and specs. Expected: PASS. Then run the gates.
- [ ] **Step 5: Commit** — "Website — touching a garment card warms that garment's data".

### Task 6: Fetch the garment document ahead (Chromium)

**Files:**
- Create: apps/cms/src/lib/speculationRules.ts
- Modify: `apps/cms/src/app/(frontend)/layout.tsx`
- Test: apps/cms/src/lib/speculationRules.test.ts, apps/cms/e2e/garmentWarm.spec.ts (one more test)

**Interfaces:**
- Produces: `GARMENT_PREFETCH_RULES`, a constant JSON string: `{"prefetch":[{"where":{"href_matches":"/products/*/*"},"eagerness":"conservative"}]}`. The layout renders it as `<script type="speculationrules">`. The Worker's nonce covers it.

- [ ] **Step 1: Check before building.** Search the viewer Worker and the digests for document counting (`rg -n "pageview|visit" apps/viewer/worker scripts/*digest*`). Expected: no server-side visit count from a document request. If one exists, stop and bring it to the owner.
- [ ] **Step 2: Write failing tests:**
  - the unit test pins the JSON above: `prefetch` only, no `prerender` key, `conservative`;
  - in Chromium, a `pointerdown` on a card produces a request for the garment document with `sec-purpose: prefetch` before the click;
  - in WebKit and Firefox, no such request.
- [ ] **Step 3:** Run them. Expected: FAIL.
- [ ] **Step 4:** Implement it.
- [ ] **Step 5:** Run them, plus `apps/cms/e2e/motion.spec.ts` and the viewer's `apps/viewer/e2e/page-transition.spec.ts`. Expected: PASS; the card grow still runs.
- [ ] **Step 6:** Run `node apps/cms/e2e/csp-nonce-edge.mjs --origin=http://localhost:4174` against `opennextjs-cloudflare preview`, as `.claude/rules/cms-site.md` describes. Expected: PASS; the rule script carries the nonce.
- [ ] **Step 7: Commit** — "Website — Chrome fetches a garment's page ahead when its card is pressed".

### Task 7: D1 read replicas

**Files:**
- Modify: `apps/cms/src/payload.config.ts` (`sqliteD1Adapter({ …, readReplicas: 'first-primary' })`)
- Test: the existing config test that reads `payload.config.ts`; find it with `rg -ln "payload.config" apps/cms/src/*.test.ts`. If none fits, add apps/cms/src/readReplicas.test.ts.

- [ ] **Step 1: Before.** From Workers logs, 7 days, record the CMS Worker's drawing wall time (store misses) by data centre (`$workers.entrypoint` set to `SitePages`), and save it under `backups/speed/`.
- [ ] **Step 2: Write a failing test.** The adapter options include `readReplicas: 'first-primary'`.
- [ ] **Step 3:** Run it. Expected: FAIL. Implement it. Run it again. Expected: PASS. Then run the gates.
- [ ] **Step 4: Ask the owner** to switch on read replication for the database. This is a Cloudflare setting. With their yes, set it through the API (`read_replication.mode: auto`), then read it back.
- [ ] **Step 5: Commit** — "CMS — page drawings read the nearest copy of the database".
- [ ] **Step 6: After merge and deploy.** Repeat Step 1 for 7 days. Expected: lower drawing wall time outside Eastern North America. Report the numbers, including a miss.

### Task 8: Warm the buyer regions after a deploy (Globalping)

**Files:**
- Create: scripts/warm-regions.mjs, scripts/warm-regions.countries.json (`["PK"]`)
- Modify: `.github/workflows/ci.yml` (a step right after "Post-deploy warm-up of the shared page store")
- Test: apps/cms/src/warmRegions.test.ts

**Interfaces:**
- Consumes:
  - `warmTapTargets` (Task 3);
  - `warmTargets` from `scripts/warm-shared-store.mjs`.
- Produces:
  - `regionWarmPlan(targets: Array<{url, headers}>, countries: string[], probesPerCountry: number): Array<object>`, the Globalping measurement bodies: `type 'http'`, `locations [{country, tags: ['eyeball-network']}]`, `limit`, `measurementOptions.request {method 'GET', path, query, headers}`.
  - `regionVerdict(results): Record<string, {hit: number, miss: number, other: number}>`.

- [ ] **Step 1: Spike first; the pipeline is built only if this passes.** After a deploy:
  1. Warm about 30 addresses from 2 Pakistan home-network probes.
  2. Measure from 3 other Pakistan probes and from this Mac.
  3. Expected: at least 4 of 5 report `hit`.

  Record the data centre (`cf-ray` suffix) each probe reached. If it fails, add probes chosen by data centre, and re-run once. If it still fails, stop and report the numbers to the owner.
- [ ] **Step 2: Write failing tests:**
  - `regionWarmPlan` gives under 100 tests in total for 30 targets, `['PK']` and 2 probes, never includes a `cookie` or `authorization` header, and uses `eyeball-network`;
  - `regionVerdict` counts `page-cache`/`api-cache` states per country.
- [ ] **Step 3:** Run them. Expected: FAIL. Implement. Run again. Expected: PASS.
- [ ] **Step 4: Add the CI step.**
  - Name it "Post-deploy warm-up of the buyer regions" (`timeout-minutes: 5`).
  - It runs `node scripts/warm-regions.mjs https://wear-run.com`.
  - It exits 0 on a Globalping error or limit, with a GitHub warning, and prints only counts and states per country.
  - Read `.github/CLAUDE.md` before editing `ci.yml`.
- [ ] **Step 5:** Run `actionlint` and the gates. Expected: PASS.
- [ ] **Step 6: Commit** — "Deploy — after each deploy, warm the shared store from Pakistan too".

### Task 9: The weekly robot

**Files:**
- Modify: `.github/workflows/perf-watch.yml` (a job running the measure-taps script against the live site, plus a Globalping measurement from scripts/warm-regions.countries.json)
- Modify: scripts/warm-regions.mjs (a `--measure` mode that reports per-country p75 instead of warming)

- [ ] **Step 1: Negative control first.** Run the job's command with `--refuse-store`. Expected: exit 1. Then run it plainly. Expected: exit 0 once Task 3 is live.
- [ ] **Step 2: Add the job.** It follows `perf-watch.yml`'s convention: it reports by failing, writes no issue, and its permissions are `contents: read`. Exit 2 (inconclusive: 403/429/503) passes with a warning.
- [ ] **Step 3:** Run `actionlint` and trigger the workflow by hand (`workflow_dispatch`) once, with the owner's yes. Expected: success, and the log shows timings only.
- [ ] **Step 4: Commit** — "Speed — the weekly watch measures taps and garment opens, from Pakistan too".

### Task 10: The loading line waits 0.4 s

**Files:**
- Modify: `apps/cms/src/lib/navProgress.ts` (`NAV_PROGRESS_DELAY_MS = 400`, comment citing the spec's Part 4)
- Modify: the `.nav-progress` comment in `apps/cms/src/app/(frontend)/site.css`, and any mention of 120 ms in `docs/DESIGN.md` (`rg -n "120 ms|NAV_PROGRESS" docs/DESIGN.md`)
- Test: `apps/cms/src/lib/navProgress.test.ts`, `apps/cms/e2e/navProgress.spec.ts`

- [ ] **Step 1: Write failing tests:**
  - `NAV_PROGRESS_DELAY_MS === 400`;
  - in the browser spec, a tap answered within 300 ms (routed with a fixed delay) never shows `.nav-progress[data-state="loading"]`;
  - the existing slow-tap check (line within 0.6 s) still passes.
- [ ] **Step 2:** Run them. Expected: FAIL on the new assertions.
- [ ] **Step 3:** Change the constant and the comments. Run again. Expected: PASS.
- [ ] **Step 4: Commit** — "Website — the loading line shows only when a tap takes longer than 0.4 s".

### Finish

- [ ] Run `node .claude/skills/gates/run-gates.mjs`. Expected: all gates pass.
- [ ] Before the merge, do the preflight per root `CLAUDE.md`: a D1 backup and the `rxps/wine` before-copy.
- [ ] After deploy, run the measure-taps script three times from this Mac and compare with the baseline.
  - Pass: G1 and G2 on warm taps, with cold first taps reported beside them and no slower than the baseline.
  - Report real numbers, including a miss.
