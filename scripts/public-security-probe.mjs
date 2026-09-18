#!/usr/bin/env node
/**
 * Assert from outside: every host serves the shared security.txt and it is not about to
 * expire, and the www./cms. redirects carry the security headers a Cloudflare rule adds.
 *
 * WHY IT EXISTS (decided 2026-09-18, live from the merge that deploys it). The 2026-09-18
 * scans found no security.txt on any host, and the www./cms. redirects answering with none
 * of the site's security headers. Both fixes live partly outside the code — a yearly Expires
 * a person must renew, and a Cloudflare response-header rule no file declares — so only a
 * request to the live hosts can see either one slip.
 *
 * WHAT A FAILURE MEANS:
 *   security.txt — a host answers it with anything but the shared text as UTF-8 plain text,
 *                  or its Expires is past, more than a year away, or under 30 days away
 *                  (renew: packages/shared/src/securityTxt.ts, then deploy).
 *   redirect     — www. or cms. answers `/` with a redirect that lacks a security header:
 *                  the response-header rule in docs/CLOUDFLARE-SETUP.md → 11.7 was changed.
 *
 * TWO MODES. After a deploy (ci.yml) it is strict. Daily (uptime.yml, `--daily`) a MISSING
 * security.txt is inconclusive rather than a failure: the daily job runs from `main`, and in
 * the minutes between a merge and its deploy the new file is not live yet — an alarm there
 * would email the owner about an outage that is not one. A present-but-expiring file still
 * fails daily, which is the job the daily run is for.
 *
 * Same discipline as scripts/apex-probe.mjs: a 403/429/503 from a runner, or a request that
 * never completed, is INCONCLUSIVE, never a pass and never a failure.
 */
import { SECURITY_TXT, securityTxtProblems } from '../packages/shared/src/securityTxt.ts'

const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/** The headers the redirect rule adds to every www./cms. redirect. */
export const REDIRECT_HEADERS = [
  'content-security-policy',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
]

/** @typedef {{ name: string, url: string, kind: 'security-txt' | 'redirect' }} SecurityTarget */

/** @type {SecurityTarget[]} */
export const TARGETS = [
  ...[
    'wear-run.help',
    // www. answers a 308 to the apex copy; followed here, as internet.nl follows it.
    'www.wear-run.help',
    'cms.wear-run.help',
    'viewer.wear-run.help',
    'catalogue.wear-run.help',
    'profile.wear-run.help',
    'catalogue.wear-run.com',
    'profile.wear-run.com',
  ].map((host) => ({
    name: `${host} security.txt`,
    url: `https://${host}/.well-known/security.txt`,
    kind: /** @type {const} */ ('security-txt'),
  })),
  { name: 'www. redirect', url: 'https://www.wear-run.help/', kind: 'redirect' },
  { name: 'cms. redirect', url: 'https://cms.wear-run.help/', kind: 'redirect' },
]

/**
 * @typedef {{
 *   name: string,
 *   kind: SecurityTarget['kind'],
 *   status: number,
 *   contentType?: string,
 *   body?: string,
 *   headers?: Record<string, string>,
 *   error?: string,
 * }} Observation
 */

/**
 * Turn observations into a verdict. Pure — no network — so every branch is testable.
 *
 * @param {Observation[]} observations
 * @param {Date} now
 * @param {{ daily?: boolean }} [options]
 * @returns {{ ok: boolean, failures: string[], inconclusive: string[], lines: string[] }}
 */
export function evaluate(observations, now, { daily = false } = {}) {
  const failures = []
  const inconclusive = []
  const lines = []

  for (const o of observations) {
    const label = o.name.padEnd(32)
    if (o.error) {
      inconclusive.push(`${o.name}: request failed (${o.error}) — inconclusive.`)
      lines.push(`  ${label} ERROR  ${o.error}`)
      continue
    }
    if (INCONCLUSIVE_STATUSES.has(o.status)) {
      inconclusive.push(`${o.name}: HTTP ${o.status} from a runner — inconclusive, not an outage.`)
      lines.push(`  ${label} ${o.status}    (inconclusive)`)
      continue
    }

    const problems = []
    if (o.kind === 'security-txt') {
      const type = String(o.contentType ?? '').toLowerCase()
      // ⚠️ "Not served yet" has TWO shapes, measured 2026-09-18 before the deploy: a 404 on
      // most hosts, and a 200 with the viewer's HTML app shell on viewer. (it reads the
      // two-segment path as a product and colour). Daily, both are inconclusive.
      if (daily && (o.status === 404 || (o.status === 200 && !type.startsWith('text/plain')))) {
        inconclusive.push(`${o.name}: not served as a text file yet (a merge not yet deployed?).`)
        lines.push(`  ${label} ${o.status}    (inconclusive, daily)`)
        continue
      }
      if (o.status !== 200) {
        problems.push(`HTTP ${o.status}, expected 200`)
      } else {
        if (!type.startsWith('text/plain') || !type.includes('charset=utf-8')) {
          problems.push(
            `content-type is "${o.contentType ?? '(none)'}", expected text/plain; charset=utf-8`,
          )
        }
        problems.push(...securityTxtProblems(o.body ?? '', now))
        if ((o.body ?? '') !== SECURITY_TXT) {
          problems.push(
            'the text differs from packages/shared/src/securityTxt.ts — a stale deploy?',
          )
        }
      }
    } else {
      if (o.status < 300 || o.status > 399) {
        problems.push(`HTTP ${o.status}, expected a redirect to the site`)
      } else {
        const missing = REDIRECT_HEADERS.filter((name) => !o.headers?.[name])
        if (missing.length > 0) {
          problems.push(`the redirect lacks ${missing.join(', ')} (the response-header rule)`)
        }
      }
    }

    if (problems.length > 0) {
      failures.push(`${o.name}: ${problems.join('; ')}.`)
      lines.push(`  ${label} ${o.status}    FAIL  ${problems.join('; ')}`)
    } else {
      lines.push(`  ${label} ${o.status}    ok`)
    }
  }

  return { ok: failures.length === 0, failures, inconclusive, lines }
}

/**
 * @param {SecurityTarget} target
 * @returns {Promise<Observation>}
 */
async function probe(target) {
  try {
    const response = await fetch(target.url, {
      redirect: target.kind === 'redirect' ? 'manual' : 'follow',
      headers: { 'user-agent': 'run-apparel-security-probe-bot/1.0' },
    })
    const body = await response.text().catch(() => '')
    /** @type {Record<string, string>} */
    const headers = {}
    for (const [name, value] of response.headers) headers[name.toLowerCase()] = value
    return {
      name: target.name,
      kind: target.kind,
      status: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      body: target.kind === 'security-txt' ? body : undefined,
      headers,
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

async function main() {
  const daily = process.argv.includes('--daily')
  const observations = await Promise.all(TARGETS.map(probe))
  const { ok, failures, inconclusive, lines } = evaluate(observations, new Date(), { daily })
  console.log(
    `[public-security-probe] security.txt on every host, and the redirect headers${daily ? ' (daily)' : ''}`,
  )
  for (const line of lines) console.log(line)
  for (const note of inconclusive) console.log(`[public-security-probe] ${note}`)
  if (!ok) {
    for (const failure of failures) console.error(`::error::${failure}`)
    process.exit(1)
  }
  console.log(
    '[public-security-probe] every host serves a current security.txt, and the redirects carry their headers.',
  )
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
