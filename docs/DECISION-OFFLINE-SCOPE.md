# Decision — offline support is shell-only, and the models are deliberately excluded

**In plain words:** Why the viewer works offline only partly, and the 3D files do not.

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

- the SPA shell (the hashed JS and CSS, and the page itself — see below)
- `/meshopt_decoder.js` — every model needs it
- `/env/studio-soft.hdr` — the lighting file

A few hundred KB. Both non-shell entries are already `immutable` in the generated
`_headers`, so this is caching what is already cacheable, for the case where the network
is gone rather than slow.

**An offline visitor gets the branded shell and the honest "reference unavailable"
path, not a broken page.** They do not get the garment.

**The page kept for offline is the garment page the visitor opened (since 2026-09-28).**
It used to be `/`, which was right while the viewer owned its whole host. When the garment
pages moved into the website at `wear-run.com/products/<product>/<colour>`, `/` became the
website's home page, so the worker now registers with scope `/products/` there and keeps
the page it was installed from (`apps/viewer/scripts/sw.mjs`). Every garment page is the
viewer's own `index.html` under its address, so any of them is a correct shell.

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

## The website gets no offline page either (decided 2026-10-02)

Everything above is about the 3D garment pages. The visual audit of 2026-10-02 (VA-23) found
that, offline after a first visit, a garment page shows its own offline notice and recovers by
itself, while the website's pages (home, `/products`, `/contact`, the guides) show the browser's
own error. **The owner decided the website gets no offline page**, because the first two reasons
above hold for it as well: a service worker only helps a second visit from the same device, and
iOS Safari clears it after 7 days without a visit. Building one would add a second service worker
beside the garment pages' (scope `/products/`, `apps/viewer/scripts/sw.mjs`) for a visitor nobody
has measured.

## What would change this

A second-visit rate that is actually measured rather than assumed, or an install-to-home-screen
flow that lifts the ITP eviction. Neither exists today. Until one does, precaching models
is a cost with no measured beneficiary, and a website offline page is too.
