# Decision — offline support is shell-only, and the models are deliberately excluded

**Decided 2026-09-05 by the owner, on the evidence below.** Recorded so this does not
reopen as an untriaged to-do every time someone greps for `serviceWorker` and finds
nothing.

Finding #29 of the 2026-09-04 product-page audit left "offline support" open, and
the 2026-09-05 second pass scored the absence 6/10 (both kept privately since
2026-09-10). The instinctive fix —
precache the garments so the page works on a bad connection — is the wrong shape here,
and the reason is the **audience**, not the byte count.

## What is being built

A service worker that caches, at most:

- the SPA shell (`/`, `index.html`, the hashed JS and CSS)
- `/meshopt_decoder.js` — every model needs it
- `/env/studio-soft.hdr` — the lighting file

A few hundred KB. Both non-shell entries are already `immutable` in the generated
`_headers`, so this is caching what is already cacheable, for the case where the network
is gone rather than slow.

**An offline visitor gets the branded shell and the honest "reference unavailable"
path, not a broken page.** They do not get the garment.

## What is deliberately NOT being built, and why

**Precaching the 53.69 MB of models across 11 garments.** Four measured reasons, in
descending order of how conclusive they are:

1. **A service worker only helps a SECOND visit.** Every visit here begins with a QR
   tag scanned off a physical garment, in a warehouse or at a trade show. There is
   rarely a second visit from the same device, and never a second visit *before* the
   first one has already downloaded the model over the network.
2. **iOS Safari evicts it.** ITP clears all script-writable storage — Cache Storage
   included — after **7 days without interaction** on a site that is not installed to
   the home screen. A QR-scan audience does not clear that bar. A QR scan opens iOS
   Safari specifically (recorded repeatedly in `apps/viewer/CLAUDE.md`).
3. **The visitors who would benefit most never download a model at all.**
   `canRender3D()` in `apps/viewer/src/lib/capabilities.ts` returns `false` under
   `navigator.connection.saveData`, so a data-saving visitor takes the poster path.
   There is nothing to cache for them.
4. **It would regress two Worker behaviours.** `shouldReturnNotFound()` in
   `apps/viewer/worker/notFound.ts` and the `no-transform` handling both live in the
   Cloudflare Worker. A service worker answering a navigation from cache returns 200
   and bypasses both. Crawlers do not run service workers, so the crawler rewrite and
   JSON-LD are safe — but the 404 semantics fixed on 2026-09-04 would silently regress
   for humans.

**Size was never the objection.** The models are served cross-origin from
`media.wear-run.help` with CORS headers, so the responses are `cors`-type and countable
rather than opaque — they would not hit the 7 MB-per-opaque-response padding penalty,
and 53.69 MB sits inside a typical quota. The objection is **lifetime**: the cache would
be populated by a visitor who has already waited for the download, and emptied before
they ever return.

## The test that keeps this decision honest

The service worker's own test asserts the cache contains **no `.glb`**, explicitly, so a
future "helpful" addition fails rather than silently shipping 53.69 MB of precache to a
phone on a trade-show connection.

## What would change this

A second-visit rate that is actually measured rather than assumed, or an install-to-home-screen
flow that lifts the ITP eviction. Neither exists today. Until one does, precaching models
is a cost with no measured beneficiary.
