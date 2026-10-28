# A store miss never slower than no store — design

Written 27 Oct 2026, and **approved by the owner the same evening, with step 0** (both live steps
below included). Nothing is built yet. Follows the faster-taps
work (#278, `docs/superpowers/specs/2026-10-27-faster-taps-edge-store-intent-design.md`): the
owner set the slow-miss fix aside as "its own design" that day, and asked for it the same evening.

**The goal in one line:** a visitor whose page is not yet in the shared store waits no longer than
they would if the store did not exist, while a visitor whose page is in it keeps today's speed.

## What happens today (measured)

The website keeps whole pages (since 24 Oct) and the data behind taps between pages (since
27 Oct) in a store Cloudflare shares between its data centres. A **hit** is answered from the
store. A **miss** (the first visitor to a page in a region, after a deploy or an edit) is drawn by
the Worker's `SitePages` entrypoint, kept, and only then answered.

**Real visitors, 27 Oct 13:30–16:45 UTC** (Workers logs, our robots and GitHub's machines left
out): 74 taps between pages. 31 took over 0.4 s on the server and 26 over 1 s, most of those
1.6–6.1 s. The slow ones were first visits, in a region, to pages the warm-ups do not cover:
`/guides`, `/inside-the-factory`, `/case-studies`, `/community`, `/glossary`, the buyer pages
(London), `/privacy` and Home (Muscat), Home (Singapore). Repeated pages (`/`, `/products`, `/contact`,
`/privacy` in London, Atlanta, San Jose) were 45–190 ms.

**The same pages, three ways, from this Mac on 27 Oct evening** (Muscat data centre; the network
adds about 200–350 ms to every number, so compare the columns):

| Asked | Store bypassed (warm Worker) | Store hit | Store miss |
|---|---|---|---|
| Tap data: About, Guides, Glossary, Community, Factory | 343–472 ms | 358–1,062 ms | **1,988–2,277 ms** |
| Whole page: About, Policies | 203–363 ms | 195–245 ms | 717 ms |
| Whole page: Glossary, Careers | 215–338 ms | 210–259 ms | **4,001–4,117 ms** |
| Whole page: Home, first ask | **3,344 ms** (a cold Worker copy) | 277–554 ms | — |

Before #278, the same taps to About, Guides, Community and the buyer pages answered in 25–42 ms
from Islamabad (the "before" log of 27 Oct morning, kept in the main checkout's backups folder,
which is never committed).

So the store does one thing very well: a hit never meets a **cold Worker copy** (Home bypassed:
3.3 s first, 0.3 s after). And one thing badly: **a miss costs 0.4–3.8 s more than a warm drawing.**

## Why a miss is slow (read in the code)

1. **The whole drawing is read before the first byte leaves.** `SitePages.fetch` in
   `apps/cms/worker.mjs` calls `await response.text()` to check the page is whole and error-free
   before it chooses the headers that tell Cloudflare whether to keep it. Headers go first, so the
   check has to finish first. A drawing that streams in 300 ms of pieces reaches the visitor as one
   piece at the end.
2. **A drawing made to be kept skips the content memory.** `apps/cms/src/lib/content.ts` keeps
   content for 60 s per Worker copy; a kept drawing reads the database instead (so a kept copy is
   never older than the database), through its own read-replica session
   (`apps/cms/src/lib/drawingDatabase.ts`).
3. **The drawing runs behind the store**, often in a Worker copy that has not drawn that page
   before. Cloudflare's docs do not say which copy runs a miss (Workers Cache configuration page,
   updated 12 Oct 2026).
4. **Each region keeps its own copy.** The US warm-up fills the runner's region and the Pakistan
   warm-up the first 30 addresses there. London, Muscat and Singapore start empty after every
   deploy.

## Options considered

**A. A hedged miss (recommended).** The visitor's request asks the store, as today. If no answer
has started within a short head start (about 150 ms, to be set from measurement), the Worker also
draws the page itself, the way it did before the store, with the content memory. The visitor gets
whichever answer starts first. The store's drawing carries on in the background (`waitUntil`) and
is read to the end, so the store still keeps the page for the next visitor.
- A hit: unchanged (it answers within the head start).
- A miss: about a warm drawing's time plus the head start, instead of the store's slow drawing.
- A cold Worker copy on a miss: as slow as before the store. The store never promised to fix that
  case: there was nothing to serve.
- Cost: on a miss the page is drawn twice. Estimate: a few hundred visitor misses a day at
  ~0.5 s of CPU each is under 5 million CPU-ms a month, about $0.10 at $0.02 per million (Workers
  pricing page, updated 2 Oct 2026; the account already uses ~82 million a month against 30
  included). Measured in step 0 before the go.

**B. Stream while keeping.** Send the store's drawing to the visitor as it arrives, and decide
whether to keep it after. Rejected as the main fix: the headers that say "keep this" go first, so
a page found broken at the end would already be kept. Cloudflare's docs do not say whether a body
that errors halfway is discarded (Workers Cache configuration, 12 Oct 2026). It would also leave
causes 2–4 untouched. Kept as a later refinement if step 0 shows the cache discards a broken body.

**C. Skip the store for pages that draw fast.** Simple, but "fast" is only true for a warm Worker
copy. Home bypassed the store took 3.3 s on a cold copy, and a hit hides exactly that. Rejected.

**D. Warm more regions.** Add the regions real visitors came from (London, Muscat, Singapore) to the
Pakistan warm-up's countries, and widen it from 30 addresses to every top-level page and its tap
and hover. It's free (Globalping, 250 tests an hour), and it removes misses rather than speeding them
up. But each region needs probes and fills only after a deploy, so it does not help after an edit.
**Recommended alongside A**, as a separate small change.

**E. Keep copies across deploys** (`cross_version_cache`, Workers Cache configuration). Rejected:
each page and each tap names the build's own script files, which change with every build. An old
copy would ask for files the new deploy no longer has, the failure behind the 3D fallback of
21 Oct.

## How A works (for the builder)

- In the default entrypoint (`apps/cms/worker.mjs`), `fromSharedStore` and `fromTapStore` race
  the store's answer against a timer. If the store's headers arrive first, serve them, as today.
  If the timer fires first, start `openNext.fetch(request, env, ctx)`, the pre-store path with the
  visitor's own request, and serve whichever answer's headers arrive first.
- The losing answer is never dropped. A losing store answer is read to the end in
  `ctx.waitUntil` (the warm-up found the store keeps an answer only once it is read in full). A
  losing direct drawing is cancelled.
- Every safety of today holds: the store is still asked from a clean request, the nonce is still
  stamped on whatever wins, and every failure still falls through to drawing.
- `Server-Timing` names the winner (`page-cache;desc="miss-direct"`), so the measure-taps script,
  the warm-ups and the Workers logs can tell a hedged miss from a hit.
- The KV off switches keep working, and a third one, `store-hedge` = `off`, turns the hedge off
  without a deploy.

## Step 0: experiments before building (read-only or throwaway)

1. **What a hit costs inside the Worker**: log the time from asking the store to its headers, for
   a day, to set the head start (it must sit above nearly every hit).
2. **Does the store keep an answer its caller stops waiting for**, if it is read to the end in
   `waitUntil`? On a throwaway Worker with Workers Cache, never the site's.
3. **What a doubled drawing costs in CPU**, from the same day's logs.

### Step 0 results

- **0.2, measured 27 Oct ~23:55 Pakistan time: YES, the store keeps an answer its caller stopped
  waiting for.** A throwaway Worker shaped like the site (a default entrypoint with caching off
  calling a cached entrypoint through `ctx.exports`, whose answer took 1.5 s and was finished
  before its headers left, as SitePages' is) was asked three ways, three rounds each, then asked
  again for the same key 3 s later: plain (first 1,629–1,653 ms, then 1–3 ms), hedged at 150 ms
  with the losing answer read to the end in `waitUntil` (150 ms, then 1–3 ms) and hedged with it
  dropped unread (150 ms, then 1–2 ms). Kept 9 of 9, all in Muscat (MCT). Reading the loser to the
  end is therefore a belt-and-braces step, kept because it costs nothing. Not tested: a body that
  streams or breaks halfway (option B's question). A hit took 1–3 ms inside that Worker for a
  small body. The Worker was deleted the same night (its address answered 404 after).
- **0.1, shipped with this step:** every store answer logs `{ storeAnswer, state, ms }`
  (`storeAnswerLog` in `apps/cms/pageCache.mjs`), for pages and taps. After a day of real
  traffic, the head start is the p95 of `ms` where `state` is `hit`.

## How we will know it worked (the judge)

- **Misses:** measure-taps on the first asks after a deploy, before and after: a miss's p75 no
  more than the head start + 100 ms above a store-bypassed tap in the same run, from this Mac and
  from the weekly runner.
- **Hits:** unchanged, within 20 ms at p75 (the same script's hit rows).
- **Real visitors:** the Workers-logs read used for the early sign (our robots and GitHub's
  machines left out): the share of taps over 0.4 s falls from 42% (31 of 74 on 27 Oct) to under
  15%, over 7 days.
- **Cost:** the CMS Worker's CPU-ms per request rises by under 10%.

## What it removes

Nothing a visitor sees. It removes one behaviour: today the first visitor in a region always
waits for the store's own drawing. After it, they may be served a direct drawing while the store
fills in the background.

## Settled after a builder's read (27 Oct)

A fresh reader asked six questions before planning. Five are settled here as the designer's calls
(marked so the owner can overrule any); the sixth is the owner's, and sits under "The owner's
decision" below.

1. **The direct drawing is exactly the pre-store path** (`openNext.fetch` with the visitor's
   request): the 60 s content memory and the main database, as before 24 Oct. The "store bypassed"
   column above was measured on that path, first asks included. If step 0 shows a cold-memory
   direct drawing spends most of its time on database trips, a read-replica session for it is the
   builder's refinement, not a new design. *(Designer's call.)*
2. **Step 0 is a gate with numbers.** Go only if, inside the Worker, a hit's store answer starts
   within 300 ms at p95 (step 0.1), the throwaway Worker shows a hedged-away answer is still kept
   (step 0.2), and a doubled drawing adds under 10% CPU per request (step 0.3). If 0.2 fails, A is
   dropped and D ships alone; B returns only if 0.2 also shows a broken body is never kept.
   *(Designer's call.)*
3. **The head start and the pass mark no longer collide.** A miss is now judged against
   "store bypassed + head start + 100 ms", not "within 150 ms". The head start is the step-0.1
   p95 of a hit inside the Worker, capped at 300 ms; the goal line above therefore means "no more
   than the head start slower than no store". *(Designer's call.)*
4. **Only what a person waits for is hedged:** whole pages (`fromSharedStore`) and taps
   (`fromTapStore`), for paths the site knows (the sitemap's pages plus the journal and
   case-study slug patterns). Not hedged: fetch-aheads (`next-router-prefetch`, nobody waits on
   them), garment data (`viewerApiCache.mjs`, its own CORS rules; a later change if A works),
   the sitemap, llms.txt and robots.txt (crawlers), and unknown paths (a scanner's 404 would be
   drawn twice every time). *(Designer's call.)*
5. **A ships first, D after A's own 7-day read**, so each change is credited with what it did.
   *(Designer's call.)*
6. **Misses for the judge come from first asks after a deploy.** A query string skips the store
   entirely (`apps/cms/pageCache.mjs`: `url.search !== ''`), so it cannot force a miss; but each
   start page → destination pair of taps has its own key, so one deploy gives many misses per
   region. `scripts/warm-shared-store.mjs` and `scripts/warm-regions.mjs` read the store's label
   with `desc="(hit|miss|skip)"`; the builder adds `miss-direct` there, or a hedged miss reads as
   no label at all. *(Designer's call.)*

## The owner's decision

Step 0 needs two things on the live account before anything is built: **one small deploy that only
logs** how long the store takes to answer inside the Worker (timings only, in Workers logs, for a
day), and **one throwaway Worker** with Workers Cache to test whether an answer is kept after its
caller stops waiting, deleted after the test. Both are Cloudflare changes, so each needs the
owner's yes. Without them the head start is a guess and A may not work at all.

**Decided 27 Oct: yes to both**, then a written build plan for A, and D after A's 7-day read.

## What is left to the builder

The head start's exact value (from step 0), how the race is written, and the tests. One test must
fail the way production does: a store that takes 2 s to answer, a direct drawing that takes
300 ms, and the visitor's answer arriving in under 500 ms.
