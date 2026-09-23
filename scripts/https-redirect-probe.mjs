/**
 * Assert that a plain-HTTP request to every customer-facing host redirects to HTTPS
 * (SE-01).
 *
 * WHY THIS EXISTS. An earlier session's sandbox could not open a plain-HTTP connection
 * to measure this at all. Re-tried 2026-09-23 from a different sandbox: plain `http://`
 * GETs to `wear-run.help`, `viewer.wear-run.help` and `cms.wear-run.help` all answered a
 * real `301` with the correct `location:`. Whatever blocked the earlier attempt does not
 * apply universally, and Cloudflare's edge behaviour is not something a code change in
 * this repo can accidentally break — but it is also not something any other check in
 * this repo measures, so this one exists to notice if it is ever undone.
 *
 * SHAPE. Modelled on `zone-security-probe.mjs` and `public-security-probe.mjs`: a
 * `TARGETS` array (re-imported from `zone-security-probe.mjs` so the two probes cannot
 * drift on which hosts exist), a pure `evaluate(observations)` function, and a thin CLI
 * `main()` that fetches and calls it. The pure/impure split is what makes a
 * planted-fault proof possible without touching a live host — `evaluate()` is unit
 * tested against synthetic observations in `apps/cms/src/httpsRedirectProbe.test.ts`.
 *
 * WHAT COUNTS AS A PASS, per host: the plain-`http://` request answers `301` or `308`,
 * and `Location` is the `https://` version of the SAME host and path — not merely "some
 * redirect happened", which would miss a misconfigured target.
 *
 * WHAT COUNTS AS A FAIL: a `200` (no redirect at all — the actual vulnerability this
 * row guards against: a garment reference, or anything else on these hosts, served in
 * the clear), a redirect that lands on the wrong host, a redirect that stays on plain
 * http, or a 3xx with no Location header at all.
 *
 * WHAT IS INCONCLUSIVE, never a pass or a fail: a 403/429/503 (Bot Fight Mode blocking a
 * datacenter IP — the same discipline every other probe in this repo follows) and a
 * connection failure (DNS, TLS, timeout). Measured=0 must never read as "everything is
 * secure" — see zone-security-probe.mjs's own comment on this, which this probe copies
 * rather than re-litigates.
 */

import { TARGETS as ZONE_TARGETS } from './zone-security-probe.mjs'

/** Statuses that mean "ask again later", not "the host is broken" — same set every probe here uses. */
const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/** Every customer-facing host, re-imported so this probe cannot drift from zone-security-probe.mjs. */
export const TARGETS = ZONE_TARGETS.map((t) => ({ host: t.host, path: '/' }))

/**
 * Turn observations into a verdict. Pure — no network, so a planted fault can be proven
 * by feeding it a deliberately wrong expectation rather than by touching a live host.
 *
 * @param {{
 *   host: string,
 *   path: string,
 *   status?: number,
 *   location?: string | null,
 *   error?: string,
 * }[]} observations
 * @returns {{ ok: boolean, measured: number, failures: string[], inconclusive: string[], lines: string[] }}
 */
export function evaluate(observations) {
  const failures = []
  const inconclusive = []
  const lines = []
  let measured = 0

  for (const o of observations) {
    const label = `${o.host}${o.path}`.padEnd(32)
    const expected = `https://${o.host}${o.path}`

    if (o.error) {
      inconclusive.push(`${o.host}: plain-HTTP request failed (${o.error}). NOT a pass.`)
      lines.push(`  ${label} unreachable — inconclusive`)
      continue
    }

    if (o.status !== undefined && INCONCLUSIVE_STATUSES.has(o.status)) {
      inconclusive.push(
        `${o.host}: HTTP ${o.status} on the plain-HTTP request — Bot Fight Mode, inconclusive rather than a failure.`,
      )
      lines.push(`  ${label} ${o.status} — inconclusive`)
      continue
    }

    measured += 1

    if (o.status !== 301 && o.status !== 308) {
      failures.push(
        `${o.host}: plain http:// did not redirect — answered HTTP ${o.status ?? '(none)'} instead of a 301/308. ` +
          'This is the vulnerability the row guards against: something on this host served in the clear.',
      )
      lines.push(`  ${label} ${o.status ?? '(none)'} — no redirect  FAIL`)
      continue
    }

    if (!o.location) {
      failures.push(`${o.host}: HTTP ${o.status} carried no Location header at all.`)
      lines.push(`  ${label} ${o.status} no Location  FAIL`)
      continue
    }

    if (o.location !== expected) {
      failures.push(
        `${o.host}: redirected to "${o.location}", expected "${expected}". ` +
          'A redirect to the wrong host or scheme is worse than none — it looks fixed while it is not.',
      )
      lines.push(`  ${label} -> ${o.location}  FAIL (expected ${expected})`)
      continue
    }

    lines.push(`  ${label} ${o.status} -> ${o.location} ok`)
  }

  return { ok: failures.length === 0, measured, failures, inconclusive, lines }
}

/** One plain-HTTP GET, redirect NOT followed — fetch follows redirects by default, which would hide the thing being measured. */
async function probeOne(target) {
  try {
    const response = await fetch(`http://${target.host}${target.path}`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
    return {
      host: target.host,
      path: target.path,
      status: response.status,
      location: response.headers.get('location'),
    }
  } catch (error) {
    return { host: target.host, path: target.path, error: error.message ?? String(error) }
  }
}

export async function probe(targets = TARGETS) {
  return Promise.all(targets.map(probeOne))
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const observations = await probe()
  const { ok, measured, failures, inconclusive, lines } = evaluate(observations)

  console.log('https redirect probe — plain-HTTP must redirect to HTTPS on every host\n')
  for (const line of lines) console.log(line)

  if (inconclusive.length) {
    console.log('\ninconclusive (NOT a pass, NOT a failure):')
    for (const note of inconclusive) console.log(`  - ${note}`)
  }

  if (!ok) {
    console.log('\nFAILURES:')
    for (const failure of failures) console.log(`  - ${failure}`)
    process.exit(1)
  }

  if (measured === 0) {
    console.log(
      '::warning::https-redirect-probe reached NO host — this run asserted nothing about the ' +
        'HTTP->HTTPS redirect. Not a failure (datacenter IPs are blocked intermittently), but do ' +
        'not read the green tick as evidence.',
    )
    console.log(`\n⚠ 0 of ${observations.length} hosts measured. Nothing was verified.`)
  } else {
    console.log(
      `\n✓ ${measured}/${observations.length} hosts measured: plain HTTP redirects to HTTPS.`,
    )
  }
}
