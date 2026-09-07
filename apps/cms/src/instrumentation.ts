/**
 * Next's server-error hook — the CMS half of L6-03.
 *
 * `onRequestError` is Next's own documented entry point for reporting server
 * errors to "any custom observability provider" (stable since 15.0.0; this app
 * is on 16.3.0). It fires for App Router route handlers, Server Components,
 * Server Actions and proxy errors, which between them is every server path in
 * this CMS.
 *
 * ⚠️ THE FILE MUST LIVE AT `src/instrumentation.ts`. Next looks in the project
 * root OR in `src/` when a `src/` directory is used, and nowhere else. Moving it
 * one level does not produce an error — the hook simply never fires, and the
 * failure mode is silence, which is exactly the state this file was written to
 * end. `src/instrumentation.test.ts` pins the location.
 *
 * There is no `register()` export on purpose. `register` runs at server start
 * and is where OpenTelemetry would be initialised; pulling OTel into this build
 * is one of the documented ways Next 16 + OpenNext fails to bundle
 * (opennextjs-cloudflare issue 969). See lib/sentry.ts for the full account of
 * why the Sentry SDK is not used here.
 */
import type { Instrumentation } from 'next'
import { resolveDsn } from './lib/reportCaught'
import { reportToSentry } from './lib/sentry'

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // Wrapped whole. This runs while the app is already failing, and an exception
  // escaping here would be thrown during the handling of another exception.
  try {
    const dsn = await resolveDsn()
    if (!dsn) return
    await reportToSentry({
      dsn,
      error,
      request: {
        path: request.path,
        method: request.method,
        headers: request.headers as Record<string, string | string[]>,
      },
      context: {
        routerKind: context.routerKind,
        routePath: context.routePath,
        routeType: context.routeType,
      },
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    })
  } catch {
    // Deliberately swallowed — see above.
  }
}
