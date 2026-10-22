/**
 * ⚠️ THE BROWSER'S OWN HARMLESS NOTICE, NOT AN ERROR OF OURS (owner, 2026-10-22).
 *
 * "ResizeObserver loop completed with undelivered notifications." (Chromium, Safari) and
 * "ResizeObserver loop limit exceeded" (older engines) mean a layout observer had more to say than
 * one frame could hold. Nothing is broken and the page draws. ONE pattern for both reporters, so
 * they cannot disagree again:
 *   - `sentry.ts` (`IGNORED_ERRORS`) already dropped it before 2026-10-22;
 *   - `telemetry.ts` did not, and it spent the per-session `client_error` cap: 17 of the 19 rows
 *     in the first public Events digest (issue #5, 2026-09-11, apps/cms/src/diagnosticsDigest.test.ts)
 *     were this notice, leaving no room for a real error behind it.
 * The website (apps/cms) has no client-side error reporter (checked 2026-10-22), so nothing there
 * needs the filter.
 *
 * The optional prefixes are the ones browsers put on the same text ("Uncaught ", "Error: ").
 */
export const RESIZE_OBSERVER_NOTICE = /^(?:Uncaught )?(?:Error: )?ResizeObserver loop/
