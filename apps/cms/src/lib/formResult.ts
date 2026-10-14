import { NextResponse } from 'next/server'

import { PROGRESS_HEADER } from './inquiryForm'

/**
 * Where a form post ends: the result panel on the form's own page, named by its anchor.
 *
 * A plain post gets a 303 — the browser must follow with GET, or a refresh re-posts the form.
 *
 * ⚠️ THE PAGE'S OWN UPLOAD GETS THE ADDRESS AS DATA INSTEAD, because it cannot read a redirect.
 * A buyer on a phone sent two tech packs (over 12 MB) and watched "Sending…" for about 100 seconds
 * with nothing moving (PostHog replay, 2026-10-08); a percent-done bar needs the page to send the
 * form with `XMLHttpRequest` (the only browser API that reports upload progress), and that follows
 * a redirect silently and drops its `#anchor`. So when the page asks with `PROGRESS_HEADER`, the
 * same address comes back as `{ to }` and the page goes there itself — the same panel, the same
 * focus, the same `inquiry_sent` / `job_application_sent` count as the plain post.
 */
export function formResult(request: Request, result: URL): NextResponse {
  if (request.headers.get(PROGRESS_HEADER) === '1') {
    return NextResponse.json(
      { to: `${result.pathname}${result.search}${result.hash}` },
      { headers: { 'cache-control': 'no-store' } },
    )
  }
  return NextResponse.redirect(result, { status: 303 })
}
