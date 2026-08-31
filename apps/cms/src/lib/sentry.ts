/**
 * Server-side error reporting for the CMS Worker — L6-03.
 *
 * WHY THIS EXISTS. Until 2026-08-31 Sentry held exactly ONE project, `viewer`,
 * and it covers the 3D viewer running in a customer's browser. The content
 * system that every product page depends on — the admin panel, the D1 writes,
 * the public viewer API the viewer itself calls — reported nothing anywhere.
 * `wrangler secret list --config apps/cms/wrangler.jsonc` returned exactly
 * PAYLOAD_SECRET and RESEND_API_KEY, and `grep -rniE 'sentry' apps/cms/src`
 * matched only test files about the heartbeat cron monitor. If the CMS broke,
 * the first anyone knew was a customer seeing REFERENCE UNAVAILABLE.
 *
 * ─── WHY NOT @sentry/nextjs ──────────────────────────────────────────────────
 * The obvious answer is the official SDK, and it is the wrong one HERE. This app
 * is Next 16.3.0 built by @opennextjs/cloudflare onto workerd, and that exact
 * combination has documented failures:
 *
 *   - `Sentry.captureRequestError` inside `onRequestError` throws an
 *     AsyncLocalStorage error on Cloudflare Workers — getsentry/sentry-javascript
 *     issue 18842. Reporters worked around it by deleting server-side Sentry and
 *     keeping only the browser, which is the state this file exists to end.
 *   - OpenTelemetry, which the SDK pulls in, fails to bundle on Next 16 +
 *     Workers — opennextjs-cloudflare issue 969.
 *   - The instrumentation hook itself failed to load under OpenNext on 15.4.1 —
 *     opennextjs-cloudflare issue 794.
 *
 * There is a second, repo-specific reason. `withSentryConfig` wraps next.config,
 * and next.config here is the subject of a trap that has already shipped a green,
 * inert fix once: `withPublicViewerVary` MUST remain the OUTERMOST wrapper or the
 * public API's `Vary: Origin` silently disappears in production. See
 * apps/cms/publicViewerHeaders.mjs. Adding a wrapper to that chain to gain error
 * reporting would risk a correctness bug in caching to fix a blindness in
 * monitoring.
 *
 * So this sends the event itself. Sentry's envelope endpoint is a documented,
 * stable HTTP API and the payload below is ~40 lines of JSON. Next's own
 * instrumentation documentation shows exactly this shape — a bare `await fetch`
 * inside `onRequestError` — as the way to report to "any custom observability
 * provider". No dependency, no bundler plugin, no next.config wrapper, nothing
 * for the OpenNext esbuild pass to trip over.
 *
 * WHAT IT DOES NOT DO, stated plainly so nobody assumes otherwise: no tracing,
 * no performance data, no source maps, no automatic breadcrumbs, and no capture
 * of anything Next does not route through `onRequestError`. It reports server
 * errors with a stack. That is the whole of it, and it is the difference between
 * blind and not blind.
 *
 * ─── PRIVACY ────────────────────────────────────────────────────────────────
 * Unlike the viewer, this app HAS a login, so headers here can carry a session.
 * `scrubHeaders` is therefore an ALLOW-LIST, not a block-list: a header has to be
 * named to survive. That direction matters — a block-list silently starts leaking
 * the day a new auth header is introduced.
 *
 * ⚠️ `user-agent` is deliberately KEPT, and that is a correction of an existing
 * mistake rather than an oversight. apps/viewer/src/lib/sentry.ts does
 * `delete request.headers` wholesale, which removed the User-Agent, which in turn
 * made Sentry's inbound crawler filter inert — the filter matches on a
 * User-Agent that our own scrub had already deleted. Dropping every header is not
 * the safe default it looks like.
 */

/** Fields parsed out of a Sentry DSN. */
export interface SentryDsn {
  host: string
  projectId: string
  publicKey: string
}

/**
 * Parse `https://<publicKey>@<host>/<projectId>`.
 *
 * Returns null rather than throwing for every malformed input, because the only
 * caller is an error handler: throwing here would replace the error being
 * reported with an error about reporting, which is strictly worse than silence.
 */
export function parseDsn(dsn: string | undefined | null): SentryDsn | null {
  if (!dsn) return null
  let url: URL
  try {
    url = new URL(dsn)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const publicKey = url.username
  const projectId = url.pathname.replace(/^\/+/, '')
  if (!publicKey || !projectId || !url.hostname) return null
  // A project id is always numeric. Checking it is what stops a DSN pasted with
  // the path half missing from producing a URL that 404s silently forever.
  if (!/^\d+$/.test(projectId)) return null
  return { host: url.host, projectId, publicKey }
}

/** The endpoint an envelope is POSTed to. */
export function envelopeUrl(dsn: SentryDsn): string {
  return `https://${dsn.host}/api/${dsn.projectId}/envelope/?sentry_key=${dsn.publicKey}&sentry_version=7`
}

/**
 * Headers worth keeping. Everything absent from this list is dropped.
 *
 * `cookie` and `authorization` are the two that would carry a live admin session,
 * and they are excluded by being unlisted rather than by being named — see the
 * allow-list note in the file header.
 */
export const KEPT_HEADERS = ['user-agent', 'referer', 'cf-ray', 'cf-ipcountry'] as const

export function scrubHeaders(
  headers: Record<string, string | string[]> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers) return out
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = rawKey.toLowerCase()
    if (!(KEPT_HEADERS as readonly string[]).includes(key)) continue
    out[key] = Array.isArray(rawValue) ? rawValue.join(', ') : String(rawValue)
  }
  return out
}

/**
 * Drop the query string, keep the path.
 *
 * Payload's admin panel puts collection filters in the query string, and those
 * can contain product names and search terms an operator typed. The path alone
 * is enough to tell one route from another.
 */
export function scrubPath(path: string | undefined): string {
  if (!path) return '/'
  const q = path.indexOf('?')
  return q === -1 ? path : path.slice(0, q)
}

/** 32 lowercase hex characters, the id format Sentry requires. */
export function eventId(random: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < 32; i++) out += Math.floor(random() * 16).toString(16)
  return out
}

/** A Node builtin — `node:internal/...`, never our code. */
const isNodeInternal = (filename: string) => filename.startsWith('node:')

/** Anywhere inside an installed dependency, at any depth. Deliberately unanchored. */
const isDependency = (filename: string) => /[\\/]node_modules[\\/]/.test(filename)

/** One parsed line of a V8 stack, in the shape Sentry's `frames` array wants. */
export interface StackFrame {
  filename: string
  function?: string
  lineno?: number
  colno?: number
  in_app: boolean
}

/**
 * Turn `error.stack` into Sentry frames.
 *
 * ⚠️ WRITTEN AFTER A LIVE FAILURE, not from the spec. The first version passed a
 * `{ frames: [], raw: [...lines] }` object, every unit test went green, Sentry
 * ACCEPTED the envelope with a 200 — and the stored event read
 * "No stacktrace available". An empty `frames` array is valid and means exactly
 * what it says; `raw` is not a field Sentry knows, so it was dropped in silence.
 * Nothing short of looking at the ingested event could have caught it, which is
 * the whole argument for proving a thing live rather than at the boundary.
 *
 * Sentry renders frames OLDEST FIRST, the opposite of the order V8 prints them,
 * so the parsed list is reversed before it is returned.
 */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return []
  const frames: StackFrame[] = []
  for (const line of stack.split('\n')) {
    const text = line.trim()
    if (!text.startsWith('at ')) continue
    const body = text.slice(3)
    // `at fn (loc)` — the parenthesised form carries a function name.
    const withName = body.match(/^(.*?)\s+\((.*)\)$/)
    const fn = withName?.[1]
    const location = withName?.[2] ?? body
    // Trailing `:line:col`, both optional. Windows drive letters and `file://`
    // URLs both contain colons, so anchor to the END rather than splitting.
    const at = location.match(/^(.*?)(?::(\d+))?(?::(\d+))?$/)
    const filename = at?.[1] ?? location
    if (!filename) continue
    const lineno = at?.[2]
    const colno = at?.[3]
    frames.push({
      filename,
      ...(fn ? { function: fn } : {}),
      ...(lineno ? { lineno: Number(lineno) } : {}),
      ...(colno ? { colno: Number(colno) } : {}),
      // Anything inside the bundle is ours; node internals and dependencies are not.
      //
      // ⚠️ TWO SEPARATE TESTS, NOT ONE ALTERNATION. This was
      // `/^node:|[\\/]node_modules[\\/]/` and CodeQL caught it on the PR
      // (js/regex/missing-regexp-anchor, HIGH): `^` binds only to the FIRST
      // alternative, so the expression reads as though both branches are anchored
      // when only one is. It happened to behave as intended — anchored `node:`,
      // unanchored `node_modules` — which is exactly why it would have survived
      // review. Written as two named checks, the intent is on the page instead of
      // depending on the reader knowing alternation precedence.
      in_app: !isNodeInternal(filename) && !isDependency(filename),
    })
    if (frames.length >= 50) break
  }
  return frames.reverse()
}

export interface RequestInfo {
  path: string
  method: string
  headers?: Record<string, string | string[]>
}

export interface ErrorContext {
  routerKind?: string
  routePath?: string
  routeType?: string
  renderSource?: string
  revalidateReason?: string
}

export interface BuildEventOptions {
  error: unknown
  request?: RequestInfo
  context?: ErrorContext
  environment?: string
  release?: string
  timestampSeconds?: number
  id?: string
}

/** The Sentry event body, before it is wrapped in an envelope. */
export function buildEvent(options: BuildEventOptions): Record<string, unknown> {
  const { error, request, context } = options
  const isError = error instanceof Error
  const value = isError ? error.message : String(error)
  // React replaces the thrown value during Server Component rendering, so the
  // `digest` is sometimes the only thing tying an event to the real fault. Next's
  // own documentation calls this out.
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest: unknown }).digest)
      : undefined

  const frames = parseStack(isError ? error.stack : undefined)

  const tags: Record<string, string> = { runtime: 'cloudflare-workers' }
  if (context?.routerKind) tags.router_kind = context.routerKind
  if (context?.routeType) tags.route_type = context.routeType
  if (context?.routePath) tags.route_path = context.routePath
  if (digest) tags.digest = digest

  return {
    event_id: options.id ?? eventId(),
    timestamp: options.timestampSeconds ?? Math.floor(Date.now() / 1000),
    platform: 'javascript',
    level: 'error',
    logger: 'cms.onRequestError',
    environment: options.environment ?? 'production',
    ...(options.release ? { release: options.release } : {}),
    server_name: 'run-apparel-viewer-cms',
    tags,
    exception: {
      values: [
        {
          type: isError ? error.name : 'Error',
          value,
          ...(frames.length ? { stacktrace: { frames } } : {}),
        },
      ],
    },
    ...(request
      ? {
          request: {
            url: scrubPath(request.path),
            method: request.method,
            headers: scrubHeaders(request.headers),
          },
        }
      : {}),
  }
}

/**
 * Serialise to Sentry's newline-delimited envelope format.
 *
 * Three lines: envelope header, item header, item payload. The trailing newline
 * is required — Sentry rejects an envelope without it.
 */
export function buildEnvelope(event: Record<string, unknown>, sentAt: string): string {
  const header = JSON.stringify({ event_id: event.event_id, sent_at: sentAt })
  const itemHeader = JSON.stringify({ type: 'event' })
  return `${header}\n${itemHeader}\n${JSON.stringify(event)}\n`
}

export interface ReportOptions extends BuildEventOptions {
  dsn: string | undefined | null
  fetchImpl?: typeof fetch
  sentAt?: string
}

/**
 * Send one error to Sentry. Resolves to true only when Sentry accepted it.
 *
 * NEVER THROWS, and never rejects. This runs inside `onRequestError`, i.e. while
 * the application is already failing; an exception raised here would be raised
 * during the handling of another exception, and in a Worker that can take down
 * the response that was still going to be returned to the user.
 */
export async function reportToSentry(options: ReportOptions): Promise<boolean> {
  const dsn = parseDsn(options.dsn)
  if (!dsn) return false
  const send = options.fetchImpl ?? fetch
  try {
    const event = buildEvent(options)
    const body = buildEnvelope(event, options.sentAt ?? new Date().toISOString())
    const response = await send(envelopeUrl(dsn), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
    })
    return response.ok
  } catch {
    return false
  }
}
