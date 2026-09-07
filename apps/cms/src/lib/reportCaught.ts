import { reportToSentry } from './sentry'

/**
 * Reporting for errors that are CAUGHT and recovered from, rather than thrown.
 *
 * ⚠️ `onRequestError` NEVER SEES THESE, WHICH IS THE WHOLE PROBLEM. Next's hook fires for
 * errors that escape a request. `src/lib/content.ts` catches its D1 failures on purpose —
 * a database wobble degrades the public pages to their defaults instead of showing a
 * visitor an error — so the request SUCCEEDS and the hook is never called. The result was
 * that a database failure became a `console.error` in a Worker log nobody reads
 * (audit FA-P-04).
 *
 * That degradation is right and stays. What was missing is anyone being told.
 *
 * ⚠️ THE DEGRADED STATE IS INDISTINGUISHABLE FROM THE HEALTHY ONE, WHICH IS WHY THIS
 * MATTERS MORE HERE THAN IT LOOKS. When `getSiteSettings` falls back, the page still
 * renders — with the shipped defaults. A wrong email address or a stale wordmark would sit
 * on the live site looking entirely normal. Measured in this session's own e2e runs: the
 * local database was missing two migrations for hours and every page test stayed green.
 *
 * Never throws. Never awaited by a render path — a report is worth nothing if it can slow
 * or fail the page it is reporting about.
 */

/**
 * The DSN, from the Worker's bindings first and the process second.
 *
 * The live Worker gets it as a Cloudflare secret, so it arrives on the OpenNext context
 * rather than on `process.env`; `next build`, tests and the Payload CLI have no context at
 * all and must not crash for the want of one. A missing DSN is a no-op, never an error —
 * which is also why `ci.yml` asserts the Worker actually holds it: without that assertion
 * a secret that failed to apply yields a silent, green, blind deploy.
 *
 * Exported so `src/instrumentation.ts` uses this one rather than keeping its own copy.
 */
export async function resolveDsn(): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const context = await getCloudflareContext({ async: true })
    const fromWorker = (context?.env as unknown as Record<string, unknown> | undefined)?.SENTRY_DSN
    if (typeof fromWorker === 'string' && fromWorker.length > 0) return fromWorker
  } catch {
    // No Cloudflare context — fall through to process.env.
  }
  return process.env.SENTRY_DSN || undefined
}

/**
 * Report a caught error, and say plainly in the log that it was reported.
 *
 * `where` is a short stable label (`content.site-settings`), not a message: it is what
 * groups these in Sentry, and a label that varies per occurrence produces one issue per
 * error rather than one issue with a count.
 */
export async function reportCaught(where: string, error: unknown): Promise<void> {
  try {
    const dsn = await resolveDsn()
    if (!dsn) return
    await reportToSentry({
      dsn,
      error,
      context: { routerKind: 'caught', routePath: where, routeType: 'degraded' },
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    })
  } catch {
    // Deliberately swallowed. This runs because something has already gone wrong.
  }
}
