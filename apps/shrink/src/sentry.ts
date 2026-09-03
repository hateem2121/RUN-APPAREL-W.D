/**
 * Tell somebody when a garment fails.
 *
 * ⚠️ UNTIL 2026-08-29 THE ENTIRE NOTIFICATION MECHANISM WAS A FIELD IN THE CMS.
 * A failed shrink wrote `status: 'failed'` and a `report` string onto the RawUpload
 * document, and that was it. No email (email is configured for password resets only),
 * no Sentry (it existed in the viewer only), no Events row (only the public viewer
 * writes those). Somebody had to open the record and look.
 *
 * That is survivable with two live products. It is not survivable with the catalogue
 * re-export in progress, where ~25 garments arrive over days and a silent failure is
 * one nobody notices until a product is missing from the site.
 *
 * ─── WHY NO SDK ─────────────────────────────────────────────────────────────
 * `@sentry/cloudflare` would work and is the official route. It is not used here
 * because this Worker needs exactly one thing — post a JSON event — and the repo pays
 * a real price for dependencies: a 24-hour publish cooldown that silently no-ops a
 * bump, a second npm lockfile the Dockerfile reads, and a held `workers-types` that
 * already constrains this package. Sentry's envelope format is a documented wire
 * protocol; this implements that directly, in ~40 lines, with no install.
 *
 * Verified against Sentry's own spec (develop.sentry.dev, "Envelopes"):
 * endpoint `POST /api/<project_id>/envelope/`, auth via `X-Sentry-Auth`,
 * content-type `application/x-sentry-envelope`, and a newline-delimited body of
 * envelope header, item header, item payload.
 *
 * ─── WHAT IT NEVER DOES ─────────────────────────────────────────────────────
 * Never throws. A fault in the thing that reports faults must not become the fault —
 * the job's own error must survive to the CMS write, which is the mechanism that
 * actually works today. Every call site treats this as fire-and-forget.
 *
 * No-op without `SENTRY_DSN`, so it is safe to deploy before the DSN exists.
 */

/** The three parts of a DSN this needs: `https://<publicKey>@<host>/<projectId>`. */
export interface ParsedDsn {
  envelopeUrl: string
  publicKey: string
}

/**
 * Split a DSN, or return null if it is absent or malformed.
 *
 * Returns null rather than throwing on a bad DSN on purpose: a typo in a Worker
 * secret must degrade to "no alerting", never to "every job dies".
 */
export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null
  try {
    const url = new URL(dsn)
    const projectId = url.pathname.replace(/^\//, '')
    if (!url.username || !projectId) return null
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    }
  } catch {
    return null
  }
}

/** What went wrong, in the shape the alert should carry. */
export interface ShrinkFailure {
  /** `refused` never retries; `retrying` will come back; `dead-letter` gave up. */
  outcome: 'refused' | 'retrying' | 'dead-letter'
  message: string
  /** The RawUpload document, so the owner can open the record straight away. */
  rawUploadId?: string | number
  /** The uploaded filename — the closest thing to a garment name the job carries. */
  filename?: string
}

/**
 * Build the envelope body.
 *
 * `eventId` and `sentAt` are parameters rather than generated inside, so the output is
 * deterministic and this can be asserted byte-for-byte in a test. A function that
 * reaches for `crypto.randomUUID()` internally can only be tested for shape.
 */
export function buildEnvelope(failure: ShrinkFailure, eventId: string, sentAt: string): string {
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: 'javascript',
    level: failure.outcome === 'retrying' ? 'warning' : 'error',
    logger: 'shrink-worker',
    // Grouped by outcome, not by message: a message carries the garment name, so
    // grouping on it would open a new Sentry issue for every single upload.
    fingerprint: ['shrink', failure.outcome],
    tags: {
      outcome: failure.outcome,
      ...(failure.filename ? { garment: failure.filename } : {}),
    },
    extra: {
      ...(failure.rawUploadId ? { rawUploadId: String(failure.rawUploadId) } : {}),
      ...(failure.filename ? { filename: failure.filename } : {}),
    },
    message: { formatted: failure.message },
  }
  const payload = JSON.stringify(event)
  return [
    JSON.stringify({ event_id: eventId }),
    JSON.stringify({ type: 'event', length: payload.length, content_type: 'application/json' }),
    payload,
  ].join('\n')
}

/** The auth header Sentry's spec defines. */
export function authHeader(publicKey: string): string {
  return `Sentry sentry_version=7, sentry_client=run-apparel-shrink/1.0, sentry_key=${publicKey}`
}

/**
 * Post the alert. Resolves to whether it was sent, and NEVER rejects.
 *
 * The boolean is for tests and for the caller's own logging — no call site branches on
 * it, because there is nothing useful to do when alerting is down.
 */
/** How long the alert POST may take (fix plan Rank 12, audit Q-03). */
export const SENTRY_TIMEOUT_MS = 10_000

export async function reportFailure(
  dsn: string | undefined,
  failure: ShrinkFailure,
  eventId: string,
  sentAt: string,
): Promise<boolean> {
  const parsed = parseDsn(dsn)
  if (!parsed) return false
  try {
    const res = await fetch(parsed.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': authHeader(parsed.publicKey),
      },
      body: buildEnvelope(failure, eventId, sentAt),
      // An alert that hangs would hold the failing job open; ten seconds is generous for
      // one small POST, and the catch below already makes a lost alert a non-event.
      signal: AbortSignal.timeout(SENTRY_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    // Deliberately swallowed. See the header: the job's real error must survive.
    return false
  }
}
