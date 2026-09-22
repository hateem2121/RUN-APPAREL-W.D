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
 *   script guard — a public page still allows 'unsafe-inline' (apps/cms/worker.mjs fell open
 *                  or was switched off), carries a <script> without its nonce (an edge feature
 *                  injecting scripts), repeats a nonce, is cacheable, or arrives cut off,
 *                  garbled or with no <script> at all; or the admin's own policy changed.
 *                  SE-04, decided 2026-09-18. docs/RUNBOOK.md → "The script guard" says what
 *                  to do.
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

/**
 * @typedef {{
 *   name: string,
 *   url: string,
 *   kind: 'security-txt' | 'redirect' | 'page-csp' | 'admin-csp',
 *   expectStatus?: number,
 * }} SecurityTarget
 */

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
  // The script guard (SE-04, decided 2026-09-18). Every public page type, and / twice so that
  // a reused nonce is visible. The admin's own policy must stay exactly as it was.
  ...['/', '/products', '/contact', '/privacy', '/terms', '/'].map((pathname, i) => ({
    name: i === 5 ? 'site / again' : `site ${pathname}`,
    url: `https://wear-run.help${pathname}`,
    kind: /** @type {const} */ ('page-csp'),
  })),
  {
    name: 'site 404',
    url: 'https://wear-run.help/definitely-not-a-page',
    kind: 'page-csp',
    expectStatus: 404,
  },
  { name: 'admin policy', url: 'https://cms.wear-run.help/admin', kind: 'admin-csp' },
]

/** The admin's own policy. The guard must never touch it (apps/cms/cspNonce.mjs → nonceable). */
export const ADMIN_CSP = "frame-ancestors 'none'"

/** A policy's script-src directive, or ''. */
const scriptSrcOf = (policy) =>
  policy
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('script-src ')) ?? ''

/** The nonce in a policy's script-src, or null. */
const scriptSrcNonce = (policy) =>
  scriptSrcOf(policy).match(/'nonce-([A-Za-z0-9+/]{22}==)'/)?.[1] ?? null

/**
 * Every <script> opening tag in a page. A pattern, not a parser, on purpose (independent review,
 * 2026-09-22): it can only err LOUD. A stray `<script` in text, or a `>` inside an attribute,
 * yields a match without this response's nonce: a false alarm. A false pass would need the
 * response's random nonce inside some other attribute. Measured 2026-09-22: every public page has
 * exactly as many `<script` as `</script>`, so no stray one hides inside a script.
 */
const scriptTags = (html) => html.match(/<script\b[^>]*>/gi) ?? []

/**
 * @typedef {{
 *   name: string,
 *   kind: SecurityTarget['kind'],
 *   status: number,
 *   expectStatus?: number,
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
  // Every public-page fetch must get its own nonce; one seen twice means a cached page.
  const seenNonces = new Set()

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
    } else if (o.kind === 'redirect') {
      if (o.status < 300 || o.status > 399) {
        problems.push(`HTTP ${o.status}, expected a redirect to the site`)
      } else {
        const missing = REDIRECT_HEADERS.filter((name) => !o.headers?.[name])
        if (missing.length > 0) {
          problems.push(`the redirect lacks ${missing.join(', ')} (the response-header rule)`)
        }
      }
    } else if (o.kind === 'page-csp') {
      // ⚠️ DAILY TOO, deliberately: catching the guard falling open is the reason this
      // exists. The only false alarm possible is a daily run landing in the ~15 minutes
      // between the guard's own merge and its deploy — re-run it once.
      const expected = o.expectStatus ?? 200
      if (o.status !== expected) problems.push(`HTTP ${o.status}, expected ${expected}`)
      const policy = o.headers?.['content-security-policy'] ?? ''
      if (scriptSrcOf(policy).includes("'unsafe-inline'")) {
        problems.push(
          "script-src still allows 'unsafe-inline': the script guard is not running " +
            '(apps/cms/worker.mjs fell open?)',
        )
      }
      // A page with nothing to inspect must not pass (independent review, 2026-09-22). Cut off by
      // an error once the rewriter was streaming, or compressed twice, it has no <script> lacking
      // the nonce, so the check below would measure nothing and say ok. Every public page ends in
      // </body></html> and carries 11 to 14 scripts (measured 2026-09-22).
      const body = o.body ?? ''
      const tags = scriptTags(body)
      if (!/<\/html>\s*$/i.test(body)) {
        problems.push('the page is cut off or garbled (it does not end in </html>)')
      }
      if (tags.length === 0) {
        problems.push('the page has no <script> at all, so its nonce was checked against nothing')
      }
      const nonce = scriptSrcNonce(policy)
      if (!nonce) {
        problems.push('the policy carries no nonce')
      } else {
        const bare = tags.filter((tag) => !tag.includes(`nonce="${nonce}"`))
        if (bare.length > 0) {
          problems.push(
            `${bare.length} <script> without this response's nonce (an edge feature injecting scripts?)`,
          )
        }
        if (seenNonces.has(nonce)) problems.push('a nonce was served twice: a cached page?')
        seenNonces.add(nonce)
      }
      if (!/\bno-store\b/.test(o.headers?.['cache-control'] ?? '')) {
        problems.push('the page is cacheable, so its nonce could be reused')
      }
    } else {
      if (o.status !== 200) problems.push(`HTTP ${o.status}, expected 200`)
      const policy = o.headers?.['content-security-policy'] ?? '(none)'
      if (policy !== ADMIN_CSP) problems.push(`the admin policy changed: "${policy}"`)
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
      expectStatus: target.expectStatus,
      contentType: response.headers.get('content-type') ?? undefined,
      body: target.kind === 'security-txt' || target.kind === 'page-csp' ? body : undefined,
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
    `[public-security-probe] security.txt, the redirect headers and the script guard${daily ? ' (daily)' : ''}`,
  )
  for (const line of lines) console.log(line)
  for (const note of inconclusive) console.log(`[public-security-probe] ${note}`)
  if (!ok) {
    for (const failure of failures) console.error(`::error::${failure}`)
    process.exit(1)
  }
  console.log(
    '[public-security-probe] security.txt is current, the redirects carry their headers, and every public page runs only nonced scripts.',
  )
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
