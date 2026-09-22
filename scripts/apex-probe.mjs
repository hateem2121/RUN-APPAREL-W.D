#!/usr/bin/env node
/**
 * Assert from outside: the apex serves the site, the two old PDF addresses stay retired,
 * the private document hosts refuse without a code — on wear-run.help and, since
 * 2026-09-17, on wear-run.com — and the two redirects old emails use still point home.
 *
 * WHY IT CHANGED (2026-09-11). This probe used to fetch the catalogue and profile PDFs
 * at `wear-run.help/catalogue` and `/profile`. Those addresses now answer 410, and the
 * documents live at `catalogue.wear-run.help/<code>` and `profile.wear-run.help/<code>`.
 * It holds NO code and must never be given one: GitHub Actions logs are public, and a
 * presigned D1 link already leaked through one (2026-09-11). UptimeRobot checks the real
 * links every five minutes instead (docs/RUNBOOK.md → "Private document links").
 *
 * WHAT A FAILURE MEANS:
 *   retired — an old address answers anything but the 410 page. The worst case is a PDF:
 *             the guessable link is open again.
 *   refused — a private host without a code answers anything but the 404 page, or drops
 *             `x-robots-tag: noindex`.
 *   site    — the apex no longer serves the site (the CMS Worker lost its wildcard route).
 *   redirect — `wear-run.help/map` or `/meeting` no longer redirects to its host. Both are
 *             Cloudflare redirect rules that exist in no file (docs/CLOUDFLARE-SETUP.md →
 *             11.8), old emails link to them, and nothing else here would notice a
 *             deletion. Compared by HOST, so the owner can change the target's path.
 *
 * KEPT FROM THE PREVIOUS VERSION, for the same measured reasons:
 * 1. A 403, 429 or 503 FROM A RUNNER IS INCONCLUSIVE, not a failure: Free-plan Bot Fight
 *    Mode blocks datacenter IPs intermittently, and an alarm that fires on Cloudflare's
 *    mood gets muted.
 * 2. A RANGED GET, NEVER HEAD: HEAD reads a different edge cache entry on this zone.
 * 3. THE BYTES DECIDE. A PDF starts `%PDF-`; an address that returns those bytes is
 *    serving the file, whatever its content-type says.
 */

/** Words the not-active page always contains. */
export const MESSAGE = 'no longer active'

/** A custom domain can take a moment after the deploy that creates it. */
export const RETRY_DELAYS_MS = [15_000, 30_000]

const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/** Any of these still takes an old email's reader to the right place. */
const REDIRECT_STATUSES = new Set([301, 302, 307, 308])

/**
 * @typedef {{
 *   name: string,
 *   url: string,
 *   kind: 'site' | 'retired' | 'refused' | 'redirect',
 *   to?: string,
 * }} ApexTarget
 */

/** @type {ApexTarget[]} */
export const TARGETS = [
  { name: 'apex root', url: 'https://wear-run.help/', kind: 'site' },
  { name: 'old catalogue', url: 'https://wear-run.help/catalogue', kind: 'retired' },
  { name: 'old profile', url: 'https://wear-run.help/profile', kind: 'retired' },
  { name: 'old www catalogue', url: 'https://www.wear-run.help/catalogue', kind: 'retired' },
  { name: 'old www profile', url: 'https://www.wear-run.help/profile', kind: 'retired' },
  { name: 'catalogue host', url: 'https://catalogue.wear-run.help/', kind: 'refused' },
  { name: 'profile host', url: 'https://profile.wear-run.help/', kind: 'refused' },
  // The same two documents on wear-run.com (decided 2026-09-17). Right after the deploy
  // that creates them, a custom domain may still be issuing its certificate: a request
  // that fails is inconclusive here, never a pass.
  { name: 'com catalogue host', url: 'https://catalogue.wear-run.com/', kind: 'refused' },
  { name: 'com profile host', url: 'https://profile.wear-run.com/', kind: 'refused' },
  // A fixed, meaningless path: it must never become a real link's words.
  { name: 'wrong code', url: 'https://catalogue.wear-run.help/not-a-real-link', kind: 'refused' },
  // Old emails link to both, and the owner asked for them to be kept forever
  // (2026-09-17). Checked by HOST only, so the target's path may change.
  {
    name: 'map redirect',
    url: 'https://wear-run.help/map',
    kind: 'redirect',
    to: 'maps.app.goo.gl',
  },
  {
    name: 'meeting redirect',
    url: 'https://wear-run.help/meeting',
    kind: 'redirect',
    to: 'app.apollo.io',
  },
]

/**
 * @typedef {{
 *   name: string,
 *   kind: ApexTarget['kind'],
 *   status: number,
 *   contentType?: string,
 *   magic?: string,
 *   wordmark?: boolean,
 *   message?: boolean,
 *   robots?: string,
 *   cache?: string,
 *   location?: string,
 *   to?: string,
 *   error?: string,
 * }} Observation
 */

/**
 * Turn observations into a verdict. Pure — no network — so every branch is testable.
 *
 * @param {Observation[]} observations
 * @returns {{ ok: boolean, failures: string[], inconclusive: string[], lines: string[] }}
 */
export function evaluate(observations) {
  const failures = []
  const inconclusive = []
  const lines = []

  for (const o of observations) {
    const label = o.name.padEnd(18)

    if (o.error) {
      inconclusive.push(`${o.name}: request failed (${o.error}) — treating as inconclusive.`)
      lines.push(`  ${label} ERROR  ${o.error}`)
      continue
    }

    if (INCONCLUSIVE_STATUSES.has(o.status)) {
      inconclusive.push(
        `${o.name}: HTTP ${o.status} from a datacenter IP. Free-plan Bot Fight Mode ` +
          'blocks these intermittently; this is inconclusive, not an outage.',
      )
      lines.push(`  ${label} ${o.status}    (inconclusive)`)
      continue
    }

    const problems = []
    const html = String(o.contentType ?? '').includes('text/html')

    if (o.kind === 'redirect') {
      let host = ''
      try {
        host = new URL(o.location ?? '').hostname
      } catch {
        host = ''
      }
      if (!REDIRECT_STATUSES.has(o.status)) {
        problems.push(
          `HTTP ${o.status}, expected a redirect — the Cloudflare redirect rule for this ` +
            'path may be gone, and old emails link here',
        )
      } else if (host !== o.to) {
        problems.push(`redirects to "${host || '(no location)'}", expected ${o.to}`)
      }
    } else if (o.kind === 'site') {
      if (o.status !== 200) {
        problems.push(
          `HTTP ${o.status}, expected 200 — the marketing site should answer here. A 404 means ` +
            'the CMS Worker no longer holds the wear-run.help/* wildcard route',
        )
      } else {
        if (!html)
          problems.push(`content-type is "${o.contentType ?? '(none)'}", expected text/html`)
        if (o.wordmark !== true) problems.push('the body does not contain "RUN APPAREL"')
      }
    } else {
      const expected = o.kind === 'retired' ? 410 : 404
      if (o.magic === '%PDF-') {
        problems.push(
          o.kind === 'retired'
            ? 'it serves a PDF — the old guessable address is open again'
            : 'it serves a PDF without a code',
        )
      }
      if (o.status !== expected) problems.push(`HTTP ${o.status}, expected ${expected}`)
      if (!html) problems.push(`content-type is "${o.contentType ?? '(none)'}", expected text/html`)
      if (o.message !== true) problems.push(`the body does not say "${MESSAGE}"`)
      if (o.kind === 'refused' && !String(o.robots ?? '').includes('noindex')) {
        problems.push('x-robots-tag does not say noindex')
      }
    }

    if (problems.length > 0) {
      failures.push(`${o.name}: ${problems.join('; ')}.`)
      lines.push(`  ${label} ${o.status}    FAIL  ${problems.join('; ')}`)
    } else {
      lines.push(`  ${label} ${o.status}    ok  cf-cache-status: ${o.cache ?? '(none)'}`)
    }
  }

  return { ok: failures.length === 0, failures, inconclusive, lines }
}

/**
 * @param {ApexTarget} target
 * @returns {Promise<Observation>}
 */
async function probe(target) {
  try {
    const response = await fetch(target.url, {
      redirect: 'manual',
      headers: { Range: 'bytes=0-4095', 'user-agent': 'run-apparel-apex-probe' },
    })
    // The CMS ignores Range, so the site's whole page arrives (~30 KB); everything else
    // here is a small page, or 4 KB of a PDF if something has gone badly wrong.
    const text = new TextDecoder().decode(
      await response.arrayBuffer().catch(() => new ArrayBuffer(0)),
    )
    return {
      name: target.name,
      kind: target.kind,
      status: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      magic: text.slice(0, 5),
      wordmark: target.kind === 'site' ? text.includes('RUN APPAREL') : undefined,
      message:
        target.kind === 'retired' || target.kind === 'refused' ? text.includes(MESSAGE) : undefined,
      robots: response.headers.get('x-robots-tag') ?? undefined,
      cache: response.headers.get('cf-cache-status') ?? '(none)',
      location: response.headers.get('location') ?? undefined,
      to: target.to,
    }
  } catch (error) {
    return {
      name: target.name,
      kind: target.kind,
      status: 0,
      to: target.to,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** @param {number} ms */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function main() {
  let observations = []
  for (const target of TARGETS) observations.push(await probe(target))

  for (const delay of RETRY_DELAYS_MS) {
    const failing = evaluate(observations).failures.map((f) => f.split(':')[0])
    if (failing.length === 0) break
    console.log(`[apex-probe] ${failing.length} target(s) failed; re-checking in ${delay / 1000} s`)
    await sleep(delay)
    observations = await Promise.all(
      TARGETS.map((target, i) => (failing.includes(target.name) ? probe(target) : observations[i])),
    )
  }

  const { ok, failures, inconclusive, lines } = evaluate(observations)
  console.log(
    '[apex-probe] the site, the retired PDF addresses, the private document hosts and the email redirects',
  )
  for (const target of TARGETS) console.log(`  ${target.name.padEnd(18)} ${target.url}`)
  for (const line of lines) console.log(line)
  for (const note of inconclusive) console.log(`[apex-probe] ${note}`)

  if (!ok) {
    for (const failure of failures) console.error(`::error::${failure}`)
    process.exit(1)
  }
  console.log(
    '[apex-probe] the site answers, the old addresses stay retired, the private hosts refuse without a code, and the email redirects still point home.',
  )
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
