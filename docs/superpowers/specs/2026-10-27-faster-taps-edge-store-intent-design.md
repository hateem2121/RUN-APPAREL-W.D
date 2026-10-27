# Faster taps on wear-run.com: edge store + intent — design

Written 27 Oct 2026. Nothing here is built. The owner chose this path on 27 Oct, after the
measurements, research and previews of 26 Oct (private preview page:
https://claude.ai/artifact/KYhtpH9zcYvSaTktKJiRwZ). An independent builder read it the same
day; every point it raised was checked against the code or the live site and folded in.

## Why

A buyer taps a link on wear-run.com and waits with nothing new on screen. Measured on the
live site on 26 Oct 2026 (headless Chromium 1440 × 900 and WebKit with the iPhone 15 profile,
from Pakistan, 3D files blocked):

| Moment | Wait |
|---|---|
| First tap after arriving (FAQ → Home, FAQ → Products) | 2.85–3.75 s (4 runs) |
| Later taps between website pages | 0.19–0.68 s |
| The loading line appears | 0.12 s after every tap |
| Product card → garment page appears | 1.2 s |
| Product card → garment loading screen lifts | 4.1 s (garment data took 3.7 s, a miss in the store) |
| Garment page opened directly, data cached | 1.2–1.5 s |

What the slow tap is made of (request timings of one FAQ → Products tap):

1. Next.js had fetched ahead only 2 KB for `/products`: the shared layout, not the page.
   Website pages are drawn per request, so Next treats them as dynamic, and a dynamic page
   is fetched ahead only down to a `loading.js` boundary. The site has none on purpose: a
   loading boundary turns a page's 404 into a 200 (`apps/cms/src/lib/navProgress.ts`).
2. On the tap, the page's data streamed from the server for 3.17 s (time to first byte
   0.22 s). The edge store that keeps whole pages never keeps this data:
   `apps/cms/pageCache.mjs` refuses any request with an `rsc` header or a query string.
3. Only then did the route's code file arrive: 0.47 s more for 4 KB.

The garment open waits on the garment data. That data is already in the shared store
(`apps/cms/viewerApiCache.mjs`), and CI warms every garment's data after each deploy
(`scripts/warm-shared-store.mjs`). Even so, the measured open was a miss: 3.7 s, where a hit is
about 55 ms. In practice each region keeps its own copy (recorded in `apps/cms/pageCache.mjs`,
25 Oct), and the warm-up runs from one CI runner's region, so a buyer in another region can
still be the first to ask.

## Goals

Measured from Pakistan, each route and each browser engine on its own (Part 5 says how):

- **G1.** When the destination's tap data is in the store, 3 taps in 4 show the new page in
  under 0.4 s, in Chromium and WebKit. This covers every tap except the first one for that
  page in a region after a deploy. That first tap is reported separately and must not be
  slower than today.
- **G2.** When the garment's data is in the store, a product card's loading screen starts to
  lift within 1.5 s of the tap (3 in 4). When it is not, the lift comes earlier than today's
  4.1 s by the head start Part 3 gives, reported with the number.
- **G3.** It stays that way: a weekly robot measures it and opens an issue when it slips.
- **G4.** Nothing visible is removed from any live page, except the loading line on taps
  under 0.4 s (Part 4, approved by the owner on 27 Oct).

## Not in this design

- The tap loader's look (A–D on the preview page). Undecided; it comes after this.
  The line's delay is the one exception (Part 4).
- The admin (`cms.wear-run.help/admin`). Untouched.
- The first-arrival screens (the /about curtain, the garment loading screen). Kept as they are.
- Next.js's new caching model (Cache Components with partial prefetching). Re-checked when
  Next.js 17 ships and Payload confirms full support. It changes the whole app, the admin
  included, and Payload 3.92 supports it only partly.
- A smaller website Worker, which cuts what a cold Worker copy costs. That is its own plan
  (26 Oct, local only). This design reduces how often a cold copy is needed; that plan cuts
  what one costs. They do not conflict. If the website ever moves to its own Worker, the
  store described here moves with the page store.
- Warming every page in every region after every deploy (Part 6 says why, with the cost).
- The 3D model download (1.8–7.8 MB per garment, measured 4 Sep).

## Must never happen

- A visitor gets another page's data, or data older than today's rules allow.
- A status code changes. A missing journal post still answers 404.
- The security policy is widened. The website's `connect-src` stays as it is in
  `apps/cms/publicViewerHeaders.mjs`.
- The admin gets slower or shows stale data. Payload 3.92 warns that a non-zero
  `staleTimes.dynamic` does both, because the website and the admin are one Next.js app.
- Anything fetched ahead that the visitor did not show intent for, a 3D model fetched
  ahead, or anything fetched ahead when the browser asks to save data.
- A fetched-ahead page counted as a visit.

## Facts the design rests on

Read and measured 26–27 Oct 2026, in the installed code (Next.js 16.4.3) where possible:

- **How a tap's request is labelled.** A tap or prefetch is a GET with an `rsc: 1` header
  and a `?_rsc=` code. The code is SHA-256 of four request headers
  (`next-router-prefetch`, `next-router-segment-prefetch`, `next-router-state-tree`,
  `next-url`), joined by commas, cut to 12 bytes and base64url-encoded
  (cache-busting-search-param.js). On 27 Oct, codes computed this way matched the browser's
  exactly.
- **Next.js checks the code.** `validateRSCRequestHeaders` defaults to true in 16.4.3
  (config-shared.js). Live on 27 Oct, a request whose code did not match its headers got a
  307 to the corrected code, not a page.
- **What differs between start pages.** The same tap to /products from /faq, /contact and
  /about carried an identical state tree (built from the destination) and a different
  `next-url` (the start page), so a different code. Two fresh visits from the same start
  page sent identical codes on all 13 requests. The state tree measured 0 bytes (tree
  prefetch, `next-router-segment-prefetch: /_tree`), 50 bytes (layout prefetch) and
  244 bytes (the tap).
- **The start page does not change what is drawn here.** For a route that cannot be
  intercepted, Next deletes `next-url` from the request before drawing ("it won't affect
  the response", base-server.js, `setVaryHeader`). This site has no intercepting routes: no
  `(.)`, `(..)` or `(...)` folder under `apps/cms/src/app`. Byte comparison cannot show this:
  two drawings for the same start page already differ in row order and per-drawing IDs.
- **`<Link prefetch={true}>` fetches the whole page ahead, even a dynamic one** (installed
  docs: link.md). According to the builder's reading of segment-cache.js, its request has
  the same shape as a tap: `rsc`, a state tree built from the destination, no prefetch
  header. To be confirmed live in Part 2. The default (`auto`) fetches a dynamic page only
  down to a `loading.js` boundary. Next's guide shows prefetching on hover
  (prefetching.md, "Hover-triggered prefetch"). Vercel's v0 case study (nextjs.org/blog,
  16 Oct 2026) moved to prefetching on hover, focus or touch after prefetching every visible
  card multiplied requests 2.9×.
- **This site's answers do not list Next's router headers in `Vary`.** Every tap answer
  measured on 27 Oct carried `Vary: Sec-CH-Prefers-Color-Scheme` only. The site sets its own
  `Vary` after `withPayload`, because a `Vary` set elsewhere was silently overridden once
  (`apps/cms/publicViewerHeaders.mjs`; the L1 incident in `apps/cms/CLAUDE.md`).
- **Workers Cache honours `Vary`.** It stores one variant per distinct value of each listed
  request header. `cf.cacheKey` replaces the path and query in the key. The Worker version
  and the entrypoint are in the key; the host is not. A local preview keeps nothing; only the
  live site shows a hit. Sources: Cloudflare docs, Workers Cache, "Cache keys" and "Content
  negotiation with Vary"; `apps/cms/pageCache.mjs` records the preview measurement.
- **30 website files import `next/link`, none set `prefetch`.**
- **Product cards link to garment pages with plain `<a>` elements**
  (`apps/cms/src/components/site/CardGallery.tsx`). A card tap is a full page load into the
  viewer Worker, which is what makes the card-grow transition work
  (`apps/cms/src/components/site/CardOpening.tsx`).
- **The garment page already asks for its data the moment its HTML arrives,** through a
  `Link: rel=preload` header (`apps/viewer/worker/apiPreload.ts`). So the data request
  starts about 1.2 s after a card tap today.
- **Chrome's speculation rules can fetch a full page load's document ahead.** Chromium only;
  Safari keeps them off by default. `conservative` starts on pointer or touch down. `moderate`
  starts after 200 ms of hover on desktop, and on phones uses viewport heuristics since
  August 2025. Rules can arrive in a `Speculation-Rules` response header pointing to a JSON
  file (Chrome docs, "Prerender pages", updated 23 Jan 2026). Google's guidance says not to
  use them for a single-page app's own navigations, so they apply only to the card → garment
  links here.
- **Website pages may not call `cms.wear-run.help`.** Their `connect-src` does not list it
  (`apps/cms/publicViewerHeaders.mjs`), and `apps/cms/src/lib/formSubmission.ts` records an
  earlier choice not to widen it.

## The design

### Part 1 — Keep tap data in the edge store

`apps/cms/worker.mjs` already sends every keepable page through the `SitePages` entrypoint,
which Workers Cache sits in front of. Tap data takes the same road, with its own rules in
`apps/cms/pageCache.mjs`.

**Which requests.** All of these must hold, or the request is served exactly as today:

- A GET on `wear-run.com`.
- A path the page store would keep (not `/admin`, `/api`, `/_next`, `/cdn-cgi`, `/film`,
  `/.well-known`).
- An `rsc: 1` header.
- A query that is exactly `_rsc=<code>` and nothing else.
- No `next-action`, `range`, `next-hmr-refresh` or `x-middleware-prefetch` header.
- No CMS login or draft cookie.
- A code that matches the visitor's own four headers. A mismatch goes to Next as today, which
  answers 307.
- A `next-router-state-tree` header no larger than a cap. The largest seen on 27 Oct was
  244 bytes. The builder sets the cap at twice the largest value seen across every route.

Every kind of tap request passes this filter: tree prefetches, segment prefetches, full
prefetches and taps. They follow one rule and are cheap to keep.

**The drawing request.** The page store already draws pages from a clean request
(`keptRenderRequest` in `apps/cms/pageCache.mjs`). Tap data is drawn the same way:
`KEPT_RENDER_HEADERS`, plus exactly the four headers that shape the answer when present:
`rsc`, `next-router-state-tree`, `next-router-prefetch` and `next-router-segment-prefetch`.
`next-url` is left out, and the `_rsc` code is recomputed for the headers actually sent, so
Next's own check passes. Leaving `next-url` out is safe because Next deletes it itself on
every route that cannot be intercepted. A unit test fails if an intercepting folder ever
appears under `apps/cms/src/app`. Nothing else the visitor sent reaches Next.

**The key.** `/__kept-rsc/<host>/<deploy>/<content>/<path>?_rsc=<recomputed code>`, built like
`sharedCacheKey` and following the same off switch for the content version. That gives one
key per destination and request kind, shared by every start page. A hover prefetch and a tap
share a key if the Part 2 check confirms they send the same headers.

**Three guards against a crafted request:**

1. The Worker refuses a visitor's code that does not match their headers.
2. Next checks the code on the drawing request.
3. `SitePages` adds a `Vary` header naming the four router headers to every kept tap
   answer, so Workers Cache stores one variant per combination. The answers this site sends
   today do not carry that `Vary` (see Facts), so this design must add it. The visitor
   still receives the site's own `Vary`.

**What is kept.** All of these must hold:

- A 200 with `content-type: text/x-component`. The store call uses `redirect: 'manual'`, as
  pages do, so a 307 is never followed or kept.
- No `set-cookie`, no `vary: *`, no content encoding.
- Drawn from the database, not the fallbacks (`spoilKeptRender`).
- The body read whole, with no error row in the payload. The builder identifies the error
  marker on a real payload and plants an error to prove the check catches it.

Kept copies carry the `site-pages` tag (`KEPT_TAGS.pages`), so a CMS save marks them stale
with the pages (`apps/cms/src/lib/contentVersion.ts`). They also carry the pages' lifetime,
and the browser gets back Next's own `cache-control`, as pages do (`servedHeaders`).

**What is served.** The kept answer, with `Server-Timing: page-cache;desc=hit|miss|skip`, as
pages get today. Tap data is not HTML, so the script guard leaves it alone.

**A miss waits for the whole answer, as pages do,** because the copy is checked whole before
it is kept. On 26 Oct the router showed the new page only after the whole answer and the code
file had arrived (3.66 s, against a stream that ended at 3.17 s), so this should cost little.
The builder measures a miss before and after. If a miss is more than 0.1 s slower, the
answer streams to the visitor while a second copy is checked and kept.

**Warm-up after a deploy.** `scripts/warm-shared-store.mjs` also asks for each website
page's tap data, once per page, because one key now serves every start page. It warms the CI
runner's region only.

**Failure.** Any error falls through to drawing the data, as the page store does.

**Off switch.** A new KV key, `rsc-store` = `off`, sends tap data around the store within
30 s, with no deploy. It works like `page-store-mode`.

### Part 2 — Fetch ahead on intent

A small client wrapper around `next/link`, used by the website's own links, changes one
thing. Before intent, prefetching stays as today (`auto`: the 2 KB layout). On intent, the
link prefetches the whole page (`prefetch={true}`). Intent means:

- the mouse entering the link (pointer type `mouse`);
- keyboard focus;
- `touchstart`.

Never on:

- Save-Data (`navigator.connection.saveData`);
- links leaving the site;
- `/products/<garment>/<colour>` links, which are not Next routes (Part 3 covers them);
- download links.

The first live check confirms that an intent prefetch sends the same headers as a tap, and so
hits the same key.

> **Checked live, 27 Oct (after the review): it does NOT.** A hover sends the tap's tree with each
> page segment's trailing empty values left off, the same from every start page tested. Contact,
> Products and Home hovers were all drawn while their taps were kept. `apps/cms/tapStore.mjs`
> `intentTreeFor` builds that tree, and the warm-ups keep both copies.

Effect: on desktop, the hover-to-click gap (usually several hundred milliseconds) hides that
much of the wait. With the store hit from Part 1, the click is served from the browser's
router cache. On a phone the touch-to-click gap is shorter, so Part 1 carries most of the gain.

### Part 3 — Garment pages: warm the data and fetch the document ahead

**Warm the garment data on intent.** The data lives on `cms.wear-run.help`, which website
pages may not call. So the website's Worker answers a same-origin address instead:
`GET /__warm/garment/<product>/<colour>`. Product and colour must match the slug pattern of
`apps/cms/viewerApiCache.mjs`. The Worker builds the `cms.wear-run.help` data request and
sends it through the store, exactly as `serveViewerApi` does. On a miss the store draws and
keeps the answer. The Worker reads the body to the end in `waitUntil` so the copy is stored,
then answers `204` with `cache-control: no-store`.

A card sends this once per garment per page view, on the same intent as Part 2 plus
`pointerdown`, with `fetch(…, { keepalive: true, priority: 'low' })`. Never on Save-Data.
The garment page's own preload, about 1.2 s later in the same region, then finds the copy
drawn or already drawing.

What this buys: the drawing starts at intent instead of when the garment page's HTML
arrives. That head start is about 1.2 s on a tap, plus the hover time on a desktop. It
shortens a cold 3.7 s drawing; it cannot make one fit inside G2's 1.5 s.

Considered and rejected: adding `cms.wear-run.help` to the website's `connect-src`. It
widens the security policy, which the site avoided before for the same host.

**Fetch the garment document ahead (Chromium).** Use speculation rules with `prefetch`
only, `href_matches: "/products/*/*"`, and eagerness `conservative`. Delivered by a
`Speculation-Rules` header on website pages, or by an inline rule that the Worker's nonce
covers; the builder picks after checking how the policy treats each. Never `prerender`: a
prerendered garment page would run the viewer, start the model download and could count as
a visit. Start with `conservative`, then measure before trying `moderate`, because on phones
`moderate` fetches on scroll.

The card-grow transition must still run after a prefetched document arrives. That is
checked by `apps/viewer/e2e/page-transition.spec.ts` and `apps/cms/e2e/motion.spec.ts`.

**The viewer does not change.**

### Part 4 — The loading line stops flashing on fast taps

`NAV_PROGRESS_DELAY_MS` in `apps/cms/src/lib/navProgress.ts` goes from 120 to 400 ms. A tap
that arrives inside 0.4 s then shows no line. Nielsen Norman Group: no indicator for waits
under about 1 s, and immediate feedback still needed. This removes something visible (the
line on fast taps). The owner approved it on 27 Oct, to ship with this work as its own
commit, last.
`apps/cms/e2e/navProgress.spec.ts` keeps its slow-tap check, which expects the line within
0.6 s.

### Part 5 — Measure, and keep it measured

A new script, measure-taps.mjs in the scripts folder, grows from the 26 Oct probe:

- **Where.** From this Mac, in Pakistan, for the before/after judgement: that is where the
  slow taps were measured. The weekly robot runs from GitHub's runners and judges against
  its own baseline, so a US runner's faster network does not hide a regression.
- **Which taps.** Home, Products, About, Contact and FAQ, each as a destination. Each tap
  runs in a fresh browser, so every tap is a visit's first tap to that page and the browser's
  own cache never answers.
- **How a tap is made.** Real input events. A desktop tap moves the mouse onto the link
  300 ms before the click. A phone tap sends `touchstart` 100 ms before the click. A plain
  tap with no intent is measured too.
- **What is reported.** p50 and p75 per route and per engine (Chromium, WebKit), 20 taps
  each. The store state of each tap (`Server-Timing`) is reported too, so a pass on warm data
  and a miss on cold data are never pooled. Card → garment opens are reported the same way.
  3D model files are blocked.
- **A blocked run proves nothing.** A 403, 429 or 503 from a runner is inconclusive and opens
  no issue, as the repository's other live checks already treat it.
- **Negative control.** The same script with a flag that sends a cookie the store refuses,
  which makes every tap a drawing. It must report a failure, or the robot proves nothing.
- **Weekly robot.** It runs inside the existing weekly `perf-watch.yml` against the live site,
  and reports the way that workflow already does: by failing the run when G1 or G2 fails,
  with no issue written. The run prints timings only; the repository's logs are public.

## How it is judged

- **Before and after on the live site.** The measure-taps script, run three times each from
  this Mac. Pass: G1 and G2 as defined above, with the cold first taps reported beside them.
- **Store hit rate.** From Workers logs over 7 days, counting tap-data requests by
  `page-cache` state, the way `docs/RUNBOOK.md` reads it for pages. Count visitor requests
  only (`$workers.entrypoint` empty), because a store miss is logged once per entrypoint
  (recorded 26 Oct). Under 50% of visitor tap-data requests answered by the store counts as
  low. Low hit rate makes warming from more places a decision for the owner, with its
  numbers.
- **Unit tests that fail first.** Each has a planted fault:
  - a visitor's code that does not match their headers never reaches the store;
  - the drawing request carries exactly the four headers and a recomputed code;
  - an intercepting folder under `apps/cms/src/app` fails the build of this rule;
  - a 307 or an error row is never kept;
  - a kept copy carries `site-pages` and the router `Vary`;
  - a query with anything besides `_rsc` is refused;
  - the warm address refuses any other path;
  - the Save-Data and leaving-the-site cases never prefetch.
- **A Next.js upgrade that changes the code fails a test.** The test computes the expected
  value with Next's own `computeCacheBustingSearchParam`.
- **The existing gates.** Browser suites, `apps/cms/e2e/csp-nonce-edge.mjs` and the
  deploy's checks.

## Risks

- **The first buyer in a region after a deploy.** Each destination pays one drawing per
  region per deploy before anyone there gains. With one key per destination that is about
  one drawing per website page. Part 6 warms the buyer regions after each deploy and makes
  every remaining miss shorter. Parts 2 and 3 act from the buyer's own browser, so they help
  even then.
- **A visitor arriving with a query string.** That visitor's state tree may differ, which
  costs that visitor a hit but never correctness: the code, Next's check and the added `Vary`
  all cover it.
- **Next.js changes its headers, its code, or when it drops `next-url`.** The tests above
  fail on the upgrade.
- **Speculation rules on phones.** Mitigated by starting with `conservative`.
- **A prefetched garment document counted as a visit somewhere on the server side.** The
  builder checks the viewer Worker and the weekly digests for document counts before Part 3
  ships.

## Part 6 — The warming pipeline (free), researched 27 Oct

The owner asked for this before anything is built: "go for all the frees" and build a
proper pipeline. Why regions miss: Workers Cache is "tiered by default" with "a generic
tiered cache topology", which is not configurable (Cloudflare docs, Workers Cache, "Tiered
cache" and "Limitations"). A data centre's miss asks an upper tier before the Worker runs.
On 25 Oct, Marseille and Muscat each drew copies the US already held
(`apps/cms/pageCache.mjs`), so in practice there is an upper tier per region. Warming a
region therefore takes one request from inside it.

**Where buyers are (Cloudflare Web Analytics, real browsers only, 30 days to 27 Oct).**

- The website: US 7,020 page loads, Pakistan 4,970, then Denmark, Norway and France at 30
  each, and fewer than 20 from any other country.
- The garment pages: US 880, Pakistan 180.

Robots are excluded, because the beacon is not added for automated browsers. CI's warm-up
already runs from GitHub's US runners, so the gap is Pakistan.

**What a Pakistan probe showed (Globalping, 27 Oct).** One GET from an Islamabad probe with
an `rsc: 1` header got Next's 307 to `?_rsc`, so custom headers reach the site. It was
served by Cloudflare's Singapore data centre (`cf-ray …-SIN`), while this Mac's requests run
in Islamabad (`cf-placement: local-ISB`). Pakistani networks reach different data centres,
so whether warming one route helps another must be measured, not assumed.

### The pipeline, after every deploy that changes the website

1. **US region (exists).** `scripts/warm-shared-store.mjs` asks for every page and every
   garment's data from the CI runner. Part 1 adds each page's tap data.
2. **Buyer regions outside the US (new).** A new CI step asks Globalping's free API to send
   the same requests from probes on home and mobile networks (Globalping's `eyeball-network`
   tag) in each buyer country. It sends custom headers too, so tap data needs no special
   address. The countries come from a short committed list, Pakistan first, reviewed against
   Web Analytics when the weekly robot reports.

   Scope per deploy: about 30 addresses (the main pages, their tap data and the most-opened
   garments' data), from 2 probes in each country, then a second pass that reads each
   answer's `Server-Timing` and prints hit or miss per country. Under 100 tests per deploy,
   inside the anonymous 250 an hour; a free Globalping account raises that to 500 if deploys
   bunch up.

   Like the existing warm-up, it never fails a deploy. It prints only timings and store
   states, because the logs are public, and it never sends a secret.
3. **Every region, including the ones nobody warms: D1 read replicas (new, free).**
   Cloudflare keeps read-only copies of the database in ENAM, WNAM, WEUR, EEUR, APAC and OC
   at no extra cost (D1 docs, "Global read replication", updated 10 Aug 2026). A cold drawing
   then reads nearby instead of making about ten trips to Eastern North America (~0.4 s each,
   recorded 7 Oct). Payload 3.92's D1 adapter supports it (`readReplicas: 'first-primary'`):
   each drawing starts at the main copy, so it is never older than the database when it
   started, and a kept copy cannot freeze content from before a save. It needs replication
   switched on for the database, a Cloudflare setting the owner approves. The gain is
   measured before and after, from Workers logs (drawing wall time by data centre) and the
   measure-taps script.
4. **The buyer's own browser (Parts 2 and 3).** Fetch ahead on intent, and warm a garment's
   data when its card is touched. This helps even where nothing was warmed.
5. **Measured weekly from where buyers are.** The weekly robot (Part 5) adds Globalping
   measurements from the buyer countries, so G1 and G2 are judged from Pakistan by machines
   other than this Mac, for free.

**The proof that warming works (a spike before Step 2 ships).** After a deploy:

1. Warm from 2 Pakistan home-network probes.
2. Measure the same addresses from 3 other Pakistan probes and from this Mac.
3. Pass: at least 4 of the 5 report `page-cache;desc="hit"`.

If warming a Singapore route does not help an Islamabad one, the step warms from more
probes, chosen by the data centre each one reaches.

**Not chosen, kept as fallbacks:**

- **Warmer Workers placed near a region.** Placement Hints (`placement.region`, added
  22 Jan 2026) run a Worker's `fetch` handler near a named cloud region, inside the $5 plan.
  Whether such a Worker fills that region's cache through a service binding is untested.
  This is the fallback if Globalping becomes unavailable.
- **Durable Objects pinned with location hints.** Same untested question.
- **Checkly's free plan** (10,000 API checks a month, 6 locations) and **Grafana Cloud's**
  (100,000 executions a month). Both need an account the owner would create.
- **Keeping kept copies across deploys** (`cache.cross_version_cache`). The docs say it
  stops each deploy from emptying the cache, which would remove most cold starts outright.
  But the site's kept pages name script files that each deploy renames, so it is safe only
  with a key that changes exactly when the website's output changes. A separate design,
  later.

**What it costs.** These numbers come from the account's real usage, read 27 Oct
(Cloudflare GraphQL, last 30 days).

- The site's Worker served 810,627 requests and used 81.6 million CPU-milliseconds. The
  whole account used about 82.2 million.
- Workers Paid ($5) includes 10 million requests and 30 million CPU-milliseconds, then $0.02
  per extra million CPU-milliseconds (Cloudflare pricing page, updated 2 Oct 2026). At that
  price the account is already about $1.04 a month over the $5. The bill itself was not
  checked.
- The last 10 deploys of the site's Worker all fell on 26 Oct, so a warm-up after every
  deploy multiplies quickly.
- A cache hit costs no CPU; a drawing does. Drawing the home page took about 739 ms of CPU
  (recorded 26 Oct).

- **Step 2's cost.** Misses in the warmed region only: about 30 drawings a deploy at well
  under a second of CPU each, about 16,000 CPU-milliseconds. At 10 deploys a day that is
  about 5 million a month, about $0.10 at the listed overage price. Part 1 removes drawings
  from every repeated tap, which should more than pay for it; the weekly robot reports both.
- **Steps 1, 3, 4 and 5 cost nothing extra.** D1 replicas are free, and Globalping's anonymous
  tier and GitHub's runners are free for this public repository.
- **Not done, on purpose:** every page in every region after every deploy, about 3,000
  drawings a deploy, which the $5 budget does not cover at today's deploy rate.

Sources, read 27 Oct:
- Cloudflare docs: Workers Cache ("Tiered cache", "Limitations", "Cache keys",
  "Configuration"), Placement (updated 12 Oct 2026), D1 "Global read replication",
  Durable Objects "Data location", Workers pricing.
- Globalping README (jsdelivr/globalping): limits and locations. Its live probe list showed
  14 probes in Pakistan, 1,077 in the US and 523 in Germany.
- Checkly's pricing page and Grafana Cloud's synthetic-monitoring page, via search results.

## Order of work

1. The measure-taps script and a baseline: three live runs, saved outside the repository.
2. Part 1, with the off switch and the deploy warm-up. The week of hit-rate data starts at
   its deploy.
3. Part 2, without waiting for that week; it helps whatever the hit rate.
4. Part 3: the warm address first, the speculation rules second.
5. Part 6: D1 read replicas (after the owner switches replication on), then the Globalping
   warm step after its spike passes.
6. Part 5's weekly robot and its negative control, with the Globalping measurements.
7. Part 4.

Before a merge that touches the CMS Worker, the usual preflight applies: a D1 backup and the
`rxps/wine` before-copy (root `CLAUDE.md`, "Deploying").

## Decided

- 26 Oct, owner: speed first, then the look; website and garment pages only, not the admin;
  keep today's first-arrival screens.
- 27 Oct, owner: edge store + intent, admin untouched.
- 27 Oct, owner: the loading line shows only after 0.4 s (Part 4), with this work.
- 27 Oct, owner: research warming further and "go for all the frees" with a proper pipeline
  (Part 6); write the build plan.

## My calls, for the owner to check

- One copy per destination, shared by every start page (Next's own rule on non-intercepted
  routes, guarded by a test).
- A same-origin warm address instead of widening the security policy.
- Speculation rules start at `conservative`, prefetch only.
- An off switch for the new store, like the page store's.
- The deploy warm-up also warms tap data.
- The measurement rules in Part 5, and 50% as the "low hit rate" line.

- Part 6 uses Globalping's anonymous tier and Pakistan as the first buyer country.

## Needs the owner's yes when the build reaches it

- Switching on D1 read replication for the database (a Cloudflare setting).
- A free Globalping account, only if deploys bunch up beyond the anonymous limit. The owner
  creates it.
