/**
 * Shared status vocabulary for raw uploads — "Queued" / "Processing…" / etc.
 *
 * MUST NOT carry `'use client'`. This file is split out of
 * RawUploadStatusCell.tsx (which does carry it) for exactly that reason, and
 * that split is load-bearing, not tidiness.
 *
 * `LABELS` used to be a named export of RawUploadStatusCell.tsx itself, and
 * views/Dashboard.tsx (a Server Component) imported it from there to label
 * its own "being processed" list. That import silently returned the wrong
 * thing, every time, not intermittently. Traced in the installed
 * next@16.2.12 / react-server-dom-webpack rather than assumed:
 * `next/dist/esm/build/webpack/loaders/next-flight-loader/index.js` rewrites
 * a `'use client'` module, for server-side consumption, by replacing EVERY
 * named export — not only the component export — with:
 *   export const LABELS = registerClientReference(function () { throw ...}, id, "LABELS")
 * and `registerClientReferenceImpl`
 * (`next/dist/compiled/react-server-dom-webpack/.../react-server-dom-webpack-server.edge.development.js`)
 * does nothing but `Object.defineProperties(thatThrowingFunction, {
 * $$typeof, $$id, $$async })`. So on the server, `LABELS` was a plain
 * function object with no `queued`/`processing`/`ready`/`failed` keys.
 * `LABELS['queued']` doesn't call the function — it's a property read on an
 * object that doesn't have that key — so it evaluated to `undefined`
 * instead of throwing, and the `?? upload.status` fallback at every call
 * site quietly won. Nothing catches this at build time: TypeScript has no
 * notion of the RSC client/server rewrite, so `next build`'s type-check
 * passes; vitest doesn't run Next's webpack/turbopack loaders at all, so it
 * never sees the rewrite either. The dashboard just showed the bare enum
 * (`queued`, `processing`) instead of the friendly label.
 *
 * A plain module with no directive is not a client boundary, so it is never
 * rewritten and survives a server import unchanged. Keep this file free of
 * `'use client'` and of anything that would require it (hooks, browser-only
 * APIs) — RawUploadStatusCell.tsx is the client half that needs those;
 * this is the shared, boundary-safe half both it and the server-rendered
 * Dashboard import from.
 */
export const LABELS: Record<string, string> = {
  queued: 'Queued',
  processing: 'Processing…',
  ready: 'Ready to review',
  failed: 'Failed',
}
