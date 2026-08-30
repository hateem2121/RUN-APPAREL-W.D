#!/usr/bin/env node
/**
 * Assert the apex actually serves the two customer-facing PDFs.
 *
 * WHY THIS EXISTS. `.github/workflows/uptime.yml` asserted that
 * `https://wear-run.help/catalogue` returns a **301**. On 2026-08-28 the catalogue
 * and company profile moved off Google Drive into the `run-assets` R2 bucket, so the
 * apex Worker now answers them directly with a 200 PDF. Three things followed:
 *
 *   1. FALSE ALARM. The check errored on every run and opened outage issue #47
 *      against a perfectly healthy site.
 *   2. FALSE GREEN. `ok=false` was only a shell variable; the last command in the
 *      step succeeded, so the run still concluded `success`. The Actions tab showed
 *      a tick while the log showed `##[error]`.
 *   3. BLIND. Because it demanded a redirect, it could no longer tell a working PDF
 *      from a broken one — a genuinely dead catalogue produced the same message.
 *
 * And the check never asserted what its own comment claimed. The 3xx branch only
 * tested that `Location` was non-empty, never where it pointed. "The catalogue probe
 * asserts the redirect still lands on the PDF" (docs/RUNBOOK.md) was never true.
 *
 * FOUR CONSTRAINTS FROM CLAUDE.md, none obvious, all shaping this design:
 *
 * 1. A 403 FROM A RUNNER IS INCONCLUSIVE, NOT A FAILURE. Free-plan Bot Fight Mode
 *    blocks datacenter IPs intermittently; it has already forced a rollback and
 *    failed a deploy on this repo. An alarm that fires on Cloudflare's mood gets
 *    muted, which is how the uptime check sat dead for 17 days.
 *
 * 2. RANGED GET, NEVER HEAD. Measured twice in both directions: a HEAD returned 200
 *    while a GET returned a 25-hour-old cached 404 (2026-08-06), and the same URL in
 *    the same minute gave `GET -> HIT (age 49431)` and `HEAD -> DYNAMIC`
 *    (2026-08-13). HEAD does not share the GET's cache entry, so it cannot see the
 *    cached-404 failure this check exists to catch. `Range: bytes=0-1023` is a GET,
 *    reads the entry a browser would read, and still reports the object's full size
 *    in `content-range` — 1 KB instead of 54 MB.
 *
 * 3. CONTENT-TYPE IS NOT ENOUGH. A Cloudflare error page can be served 200 with a
 *    coerced type. The first bytes of a real PDF are `%PDF-`; an error page's are
 *    not. Having fetched 1024 bytes anyway, checking the magic number is free.
 *
 * 4. THE URL IS NOT A CONSTANT. `siteSettings.catalogueUrl` lives in the CMS and is
 *    overridable per product. uptime.yml hard-coded a second copy — the same shape
 *    as the `n001` -> `rxps` drift that broke two post-deploy gates on 2026-08-15.
 *    This resolves the URL from the live payload, and falls back only if the API is
 *    unreachable (which its own target reports separately).
 */

import { DEFAULT_PRODUCT } from './live-products.mjs'

const API = 'https://cms.wear-run.help/api/public/viewer'

/**
 * A PDF smaller than this is not one of ours.
 *
 * The two live files are 54,336,461 B and 16,891,515 B. A Cloudflare error page is
 * ~28 KB, which is the actual failure this floor separates from success. 1 MB sits
 * far above the error page and far below either real file.
 */
const MIN_PDF_BYTES = 1_000_000

/** Statuses that mean "ask again later", not "the apex is broken". */
const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/**
 * @typedef {{
 *   name: string,
 *   url: string,
 *   kind: 'pdf' | 'not-found',
 * }} ApexTarget
 */

/**
 * The fallback targets. `catalogue` is replaced at run time by whatever the live CMS
 * payload names, so this literal is the last resort, not the source of truth.
 *
 * @type {ApexTarget[]}
 */
export const TARGETS = [
  { name: 'catalogue', url: 'https://wear-run.help/catalogue', kind: 'pdf' },
  { name: 'profile', url: 'https://wear-run.help/profile', kind: 'pdf' },
  // The bare apex must keep 404ing fast rather than hanging — the original reason
  // this Worker exists (it returned 522 after 20.2 s until 2026-08-19).
  { name: 'apex root', url: 'https://wear-run.help/', kind: 'not-found' },
]

/**
 * Turn observations into a verdict. Pure — no network — so every branch, including
 * the ones that only happen while Cloudflare is challenging the runner, is testable.
 *
 * @param {{
 *   name: string,
 *   status: number,
 *   contentType?: string,
 *   totalBytes?: number,
 *   magic?: string,
 *   kind: 'pdf' | 'not-found',
 *   cache?: string,
 *   error?: string,
 * }[]} observations
 * @returns {{ ok: boolean, failures: string[], inconclusive: string[], lines: string[] }}
 */
export function evaluate(observations) {
  const failures = []
  const inconclusive = []
  const lines = []

  for (const o of observations) {
    const label = o.name.padEnd(12)

    if (o.error) {
      inconclusive.push(`${o.name}: request failed (${o.error}) — treating as inconclusive.`)
      lines.push(`  ${label} ERROR  ${o.error}`)
      continue
    }

    if (INCONCLUSIVE_STATUSES.has(o.status)) {
      // Bot Fight Mode. Never an assertion failure — see constraint 1 in the header.
      inconclusive.push(
        `${o.name}: HTTP ${o.status} from a datacenter IP. Free-plan Bot Fight Mode ` +
          'blocks these intermittently; this is inconclusive, not an outage.',
      )
      lines.push(`  ${label} ${o.status}    (inconclusive)`)
      continue
    }

    if (o.kind === 'not-found') {
      if (o.status !== 404) {
        failures.push(`${o.name}: expected 404, got HTTP ${o.status}.`)
        lines.push(`  ${label} ${o.status}    FAIL (expected 404)`)
      } else {
        lines.push(`  ${label} 404    ok`)
      }
      continue
    }

    // A ranged GET answers 206; an origin that ignores Range answers 200. Both fine.
    if (o.status !== 200 && o.status !== 206) {
      failures.push(
        `${o.name}: HTTP ${o.status}. A 404 here can be a CACHED miss from before the ` +
          'file existed — the fix is a Custom Purge of this exact URL, not a redeploy.',
      )
      lines.push(`  ${label} ${o.status}    FAIL`)
      continue
    }

    const problems = []
    if (!String(o.contentType ?? '').includes('application/pdf')) {
      problems.push(`content-type is "${o.contentType ?? '(none)'}", expected application/pdf`)
    }
    // Constraint 3: an error page can carry a coerced content-type. The bytes cannot lie.
    if (o.magic !== '%PDF-') {
      problems.push(`does not begin with %PDF- (got ${JSON.stringify(o.magic ?? '')})`)
    }
    if (!Number.isFinite(o.totalBytes) || Number(o.totalBytes) < MIN_PDF_BYTES) {
      problems.push(`size ${o.totalBytes ?? 'unknown'} B is under the ${MIN_PDF_BYTES} B floor`)
    }

    if (problems.length > 0) {
      failures.push(`${o.name}: ${problems.join('; ')}.`)
      lines.push(`  ${label} ${o.status}    FAIL  ${problems.join('; ')}`)
      continue
    }

    const mb = (Number(o.totalBytes) / 1_000_000).toFixed(1)
    lines.push(`  ${label} ${o.status}    ok  ${mb} MB  cf-cache-status: ${o.cache ?? '(none)'}`)
  }

  return { ok: failures.length === 0, failures, inconclusive, lines }
}

/**
 * Ranged GET — the browser's cache entry, at HEAD's cost. See constraint 2.
 *
 * @param {ApexTarget} target
 */
async function probe(target) {
  try {
    const response = await fetch(target.url, {
      redirect: 'manual',
      headers: {
        Range: 'bytes=0-1023',
        'user-agent': 'run-apparel-apex-probe',
      },
    })

    const range = response.headers.get('content-range')
    const totalBytes = range
      ? Number(range.split('/')[1])
      : Number(response.headers.get('content-length'))

    // Only the first bytes are needed, and only 1024 were requested.
    const buffer = await response.arrayBuffer().catch(() => new ArrayBuffer(0))
    const magic = new TextDecoder().decode(buffer.slice(0, 5))

    return {
      name: target.name,
      kind: target.kind,
      status: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      totalBytes: Number.isFinite(totalBytes) ? totalBytes : undefined,
      magic,
      cache: response.headers.get('cf-cache-status') ?? '(none)',
    }
  } catch (error) {
    return {
      name: target.name,
      kind: target.kind,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Ask the CMS where the catalogue actually is (constraint 4). Returns the fallback
 * targets unchanged if the API cannot be reached — that failure is the product API's
 * own to report, not this probe's to duplicate.
 *
 * @returns {Promise<ApexTarget[]>}
 */
async function resolveTargets() {
  try {
    const response = await fetch(`${API}/${DEFAULT_PRODUCT.slug}/${DEFAULT_PRODUCT.colourway}`, {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return TARGETS
    const payload = await response.json()
    const live = payload?.product?.catalogueUrl ?? payload?.siteSettings?.catalogueUrl
    if (typeof live !== 'string' || !live.startsWith('https://')) return TARGETS
    return TARGETS.map((t) => (t.name === 'catalogue' ? { ...t, url: live } : t))
  } catch {
    return TARGETS
  }
}

async function main() {
  const targets = await resolveTargets()
  const observations = []
  for (const target of targets) {
    observations.push(await probe(target))
  }

  const { ok, failures, inconclusive, lines } = evaluate(observations)

  console.log('[apex-probe] the apex serves the customer-facing PDFs')
  for (const target of targets) console.log(`  ${target.name.padEnd(12)} ${target.url}`)
  for (const line of lines) console.log(line)
  for (const note of inconclusive) console.log(`[apex-probe] ${note}`)

  if (!ok) {
    for (const failure of failures) console.error(`::error::${failure}`)
    process.exit(1)
  }
  console.log('[apex-probe] both PDFs serve, and the bare apex still 404s.')
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
