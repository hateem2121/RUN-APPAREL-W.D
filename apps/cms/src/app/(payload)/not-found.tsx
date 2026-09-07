import Link from 'next/link'

/**
 * ⚠️ THIS EXISTS SO THE ADMIN NEVER FALLS THROUGH TO THE MARKETING SITE'S 404.
 *
 * `src/app/not-found.tsx` — the branded public 404 — was moved to the app root on
 * 2026-09-07, because `notFound()` does not server-render its page and only Next's own
 * unmatched handling does (vercel/next.js#62228). A root `not-found.tsx` applies to the
 * WHOLE app except where a closer one exists, and until this file was added the closest
 * one to the Payload group was that public page.
 *
 * The consequence was caught immediately by `e2e/notfound.spec.ts`: `GET /admin` returned
 * Payload's own document shell — `data-theme`, `dir="LTR"` — with the marketing site's
 * "404 · PAGE NOT FOUND" inside it. Payload's generated
 * `admin/[[...segments]]/not-found.tsx` did not help, because it only covers throws from
 * BELOW that segment; a `notFound()` raised in the group's layout, or before the segment
 * resolves, climbs past it.
 *
 * ⚠️ AND IT MUST NOT RENDER `<html>` OR `<body>`. `(payload)/layout.tsx` is a root layout
 * — it returns Payload's `RootLayout`, which renders the document — so this is a fragment
 * inside it. The public 404 at the app root is the opposite case and must supply its own
 * document; the two files look inconsistent for that reason and both are correct.
 *
 * Deliberately plain. This is reached by a logged-out or mistyped admin URL, and dressing
 * it in the marketing site's chrome is what this file exists to prevent — an admin URL
 * that answers with a sales page reads as a misconfigured deploy.
 */
export default function PayloadNotFound() {
  return (
    <div style={{ padding: '48px 24px', maxWidth: '32rem', margin: '0 auto' }}>
      <h1>Not found</h1>
      <p>That admin address does not exist.</p>
      <p>
        <Link href="/admin">Go to the dashboard</Link>
      </p>
    </div>
  )
}
