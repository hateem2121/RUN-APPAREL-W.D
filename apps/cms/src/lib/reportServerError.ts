import type { AfterErrorHook } from 'payload'
import { resolveDsn } from './reportCaught'
import { reportToSentry, scrubHeaders } from './sentry'

/**
 * Payload's root `afterError` hook: every 5xx the REST API answers goes to Sentry.
 *
 * ⚠️ `onRequestError` NEVER SEES THESE (src/instrumentation.ts). Payload catches an error
 * inside its own route handler and answers it itself (`routeError` in payload 3.90.2's
 * `dist/utilities/routeError.js`), so to Next the request succeeded. On 2026-10-14 at
 * 17:20:55 and 17:20:57 UTC the public garment API answered 500 for r-xmp/wine and
 * r-afp/petrol; the uptime check opened issue #189, and Sentry held nothing. The reason was
 * only in the Worker's own log: `D1_ERROR: internal error; reference = …`, Cloudflare's
 * database failing on its side for about two seconds. `routeError` calls this hook for every
 * error it answers, which is Payload's documented place for "logging errors to a third-party
 * service" (payloadcms.com/docs/hooks/overview, read 2026-10-15).
 *
 * ⚠️ 5xx ONLY. A 4xx is Payload answering a visitor correctly (a wrong password, a validation
 * error, a missing document); reporting those would bury the next database failure under
 * login typos.
 *
 * Returns nothing, so Payload's own answer (status and body) is unchanged. Never throws: it
 * runs while a 500 is already being answered. The send goes to `waitUntil` where the Worker
 * offers one, so the visitor's error is not held up by Sentry either.
 */

/** The status Payload answers with: `err.status || 500`, exactly as `routeError` reads it. */
export function errorStatus(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' && status > 0 ? status : 500
}

async function waitUntilOf(): Promise<((promise: Promise<unknown>) => void) | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const context = await getCloudflareContext({ async: true })
    return context?.ctx ? (promise) => context.ctx.waitUntil(promise) : null
  } catch {
    return null
  }
}

export const reportServerErrors: AfterErrorHook = async ({ error, req }) => {
  try {
    if (errorStatus(error) < 500) return
    const dsn = await resolveDsn()
    if (!dsn) return
    const path = req?.pathname ?? '/'
    const send = reportToSentry({
      dsn,
      error,
      logger: 'cms.afterError',
      request: {
        path,
        method: req?.method ?? 'GET',
        // Allow-listed HERE as well as inside buildEvent: an admin request carries the
        // session cookie, and it should never even reach the reporter.
        headers: req?.headers ? scrubHeaders(Object.fromEntries(req.headers.entries())) : undefined,
      },
      context: { routerKind: 'payload', routePath: path, routeType: 'rest' },
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    }).catch(() => false)
    const waitUntil = await waitUntilOf()
    if (waitUntil) waitUntil(send)
    else await send
  } catch {
    // Deliberately swallowed. This runs because something has already gone wrong.
  }
}
