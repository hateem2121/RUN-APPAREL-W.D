# Decision — AR is iOS Quick Look only, and Android is blocked by the loader

**In plain words:** Why "see it in your room" works only on iPhones and iPads for now.

**Decided 2026-09-05 by the owner, on the evidence below.** Finding #26 of the
2026-09-04 product-page audit (kept privately since 2026-09-10) left "View in your
space" open. This records
what was measured, so the Android half is not re-attempted as an oversight.

## What is being built

`ar`, `ar-modes="quick-look"`, `ar-placement="floor"`, `ar-scale="fixed"` on the
`<model-viewer>` in `apps/viewer/src/components/Stage.tsx`, plus **our own
`<button slot="ar-button">`**.

## Two things that make this much smaller than the audit assumed

**No USDZ file is needed, and the pipeline needs no work.** model-viewer 4.3.1 generates
the USDZ *in the browser*: `lib/features/ar.js` runs `const generateUsdz = !this.iosSrc`
and, when true, calls `prepareUSDZ()` → three.js's `USDZExporter` → a `blob:` URL handed
to Quick Look. `tools/asset-pipeline` has no `usdz`/`usd`/`Reality` code and does not
need any. A pipeline-produced USDZ would be a four-package change — a new CMS media type,
a new shared type, a new API projection, a new MIME entry — for no benefit here.

**It costs zero new bytes.** The whole AR implementation already ships inside the
`model-viewer` chunk that every build emits. Turning AR on un-hides a button in code that
is already downloaded. The `script` budget in `scripts/check-bundle-budget.mjs` should be
byte-identical before and after; if it moves, something else changed.

## Why Android is excluded

**Android's Scene Viewer cannot read a `blob:` URL.** model-viewer's own source says so:
Scene Viewer "cannot securely read browser-generated `blob:` URIs due to cross-process
security restrictions. Attempting to pass one will cause Scene Viewer to crash or fail
silently." `$openSceneViewer` builds its `intent://…&file=` from `src` verbatim.

`Stage.tsx` gives `<model-viewer>` a `blob:` URL on purpose — we fetch the GLB ourselves
so we can show byte-accurate progress and the blurred colourway photo. That is finding
#28's territory, and it exists because **a customer on 2 Mbit looked at an empty stage for
45–62 seconds**. Unblocking Android AR means giving up:

- the "5.6 MB · ~8s left" readout and the whole of `apps/viewer/src/lib/loadProgress.ts`
- the blurred placeholder, whose blur is driven by percent-complete
- the 25%-step screen-reader progress announcements
- the `bytes` field on the `model_loaded` event, which exists because "4s" means something
  different for a 1.9 MB pullover than for an 8.2 MB bib

**Android AR and the loading progress bar are the same decision.** The owner chose the
progress bar. Android users simply see no AR button — `ar-modes="quick-look"` means the
button never activates off iOS, which is the correct degradation rather than a broken one.

## Two things to verify before shipping, and one that cannot be verified here

1. **`Permissions-Policy` is probably not a blocker, despite a comment claiming it is.**
   `apps/viewer/scripts/csp.mjs` carries a forward-looking note that `camera=()` "WILL
   block `<model-viewer ar>`". `xr-spatial-tracking` is **absent** from the emitted header,
   and its spec default allowlist is `self`, so WebXR is not blocked for this document;
   Quick Look is an `<a rel="ar">` navigation into a system app and is not gated by
   Permissions-Policy at all. In a codebase whose rule is "measure it, do not reason about
   it", that comment is a claim to test on a device rather than design around. If the header
   does need to change, it is declared in **two** files that must move together
   (`apps/viewer/scripts/csp.mjs` and `apps/viewer/worker/securityHeaders.ts`) and pinned by
   `apps/viewer/scripts/csp.test.ts`.
2. **The garment must be authored at real-world scale in metres.** `ar-scale="fixed"` is
   what makes AR useful for judging fit, and it makes a wrongly-scaled export
   un-correctable by the visitor. `getDimensions()` on a loaded model answers this in one
   line — check before shipping, not after.
3. **Whether Quick Look actually places the garment on a floor cannot be tested here.**
   The iOS Simulator has no camera and no ARKit session. The simulator can confirm the
   button renders, that `ar-status` transitions, and that `prepareUSDZ()` produces a
   `model/vnd.usdz+zip` blob. The last step needs a physical iPhone and is the owner's.

## Also noted

`prepareUSDZ()` temporarily reparents the scene graph (`target.remove(m)` /
`exportGroup.add(m)` / `target.add(m)` and toggles shadow visibility). That is the same
object graph `apps/viewer/src/lib/decal-depth-bias.ts` and
`apps/viewer/src/lib/camera-near-plane.ts` reach into via internal symbols. Neither has
been exercised across an AR round-trip. Check the decals still sit correctly after
returning from AR.
