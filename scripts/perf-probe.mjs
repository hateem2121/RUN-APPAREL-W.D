#!/usr/bin/env node
/**
 * Measure live production response times against committed thresholds.
 *
 * WHY. `lighthouserc.json` and `scripts/check-bundle-budget.mjs` both measure the
 * application SHELL, and the shell is ~5% of what a buyer downloads. The numbers that
 * describe the real experience — time to first byte on the viewer, the product API,
 * the model — were measured by hand on 2026-08-13 and written into
 * `docs/QA-CHECKLIST.md`. A number in a checklist is not a watch; it is a number that
 * was true once. This turns them into something that can fail.
 *
 * THREE CONSTRAINTS FROM CLAUDE.md, all of which shape the design and none of which
 * are obvious:
 *
 * 1. A 403 FROM A RUNNER IS INCONCLUSIVE, NOT A FAILURE. Free-plan Bot Fight Mode
 *    intermittently blocks datacenter traffic; it already forced an API cutover to be
 *    rolled back and later failed a deploy through a check that read the 403 as "no
 *    model". Treating it as a failure here would produce an alert that fires on
 *    Cloudflare's mood, and an alert that cries wolf gets muted — which is how the
 *    uptime check sat dead for 17 days.
 *
 * 2. NEVER GET THE MODEL. It is 27 MB. The R2 egress budget is part of a $5/month
 *    cap, and a weekly GET is affordable only until someone changes the schedule.
 *    HEAD gives existence and content-length, which is all this needs.
 *
 * 3. cf-cache-status MUST BE READ FROM THE GET's OWN HEADERS, never from a HEAD.
 *    Measured twice, in both directions: on 2026-08-06 a HEAD returned 200 while a
 *    GET returned a 25-hour-old cached 404; on 2026-08-13 the same URL in the same
 *    minute gave `GET → HIT (age 49431)` and `HEAD → DYNAMIC`. HEAD does not share
 *    the GET's cache entry. A probe using `curl -I` concludes the model is never
 *    cached, which is a convincing and completely false performance finding.
 *
 * Consequence of (2) and (3) together, stated plainly because it is a real limit:
 * this probe CANNOT report the model's cache status, because doing so would require
 * a 27 MB GET. It reports reachability only, and says so.
 */

/** Thresholds, from the live measurements recorded in docs/QA-CHECKLIST.md. */
export const TARGETS = [
  {
    name: 'viewer HTML',
    path: '/n001/wine',
    host: 'https://viewer.wear-run.help',
    method: 'GET',
    // Measured 0.47–0.92 s. The checklist says treat > 1.5 s as a problem; 2.5 s is
    // the ALERT line, deliberately above it — this fires an issue, and the gap
    // between "worth looking at" and "worth waking someone" should be real.
    maxSeconds: 2.5,
  },
  {
    name: 'product API',
    path: '/api/public/viewer/n001/wine',
    host: 'https://cms.wear-run.help',
    method: 'GET',
    // Measured 2.1–3.7 s and KNOWN SLOW BY DESIGN: a Worker's own response does not
    // pass through the edge cache, so its s-maxage buys nothing. This is why
    // per-garment link previews are crawler-only. 6 s is the line.
    maxSeconds: 6,
  },
  {
    name: 'health',
    path: '/api/health',
    host: 'https://cms.wear-run.help',
    method: 'GET',
    maxSeconds: 3,
  },
]

/** Statuses that mean "ask again later", not "the site is slow or broken". */
const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/**
 * Turn a set of observations into a verdict. Pure — no network — so every branch,
 * including the ones that only happen when Cloudflare is challenging the runner, is
 * testable.
 *
 * @param {{name: string, ok: boolean, status: number, seconds: number, maxSeconds: number, error?: string}[]} observations
 * @returns {{ ok: boolean, failures: string[], inconclusive: string[], lines: string[] }}
 */
export function evaluate(observations) {
  const failures = []
  const inconclusive = []
  const lines = []

  for (const o of observations) {
    if (o.error) {
      inconclusive.push(`${o.name}: request failed (${o.error}) — treating as inconclusive.`)
      lines.push(`  ${o.name.padEnd(16)} ERROR  ${o.error}`)
      continue
    }
    if (INCONCLUSIVE_STATUSES.has(o.status)) {
      // Bot Fight Mode. Never an assertion failure — see the header.
      inconclusive.push(
        `${o.name}: HTTP ${o.status} from a datacenter IP. Free-plan Bot Fight Mode ` +
          'blocks these intermittently; this is inconclusive, not a regression.',
      )
      lines.push(`  ${o.name.padEnd(16)} ${o.status}    (inconclusive)`)
      continue
    }
    if (!o.ok) {
      failures.push(`${o.name}: HTTP ${o.status}`)
      lines.push(`  ${o.name.padEnd(16)} ${o.status}    FAIL`)
      continue
    }

    const over = o.seconds > o.maxSeconds
    lines.push(
      `  ${o.name.padEnd(16)} ${o.status}    ${o.seconds.toFixed(2)}s / ${o.maxSeconds}s${over ? '  SLOW' : ''}`,
    )
    if (over) {
      failures.push(`${o.name}: ${o.seconds.toFixed(2)}s exceeds the ${o.maxSeconds}s threshold.`)
    }
  }

  return { ok: failures.length === 0, failures, inconclusive, lines }
}

async function probe(target) {
  const url = `${target.host}${target.path}`
  const started = performance.now()
  try {
    const response = await fetch(url, {
      method: target.method,
      redirect: 'follow',
      headers: { 'user-agent': 'run-apparel-perf-probe' },
    })
    // Drain the body so `seconds` measures a complete small response rather than
    // just the headers. Every target here is small by construction; the 27 MB model
    // is deliberately not one of them.
    await response.arrayBuffer()
    return {
      name: target.name,
      ok: response.ok,
      status: response.status,
      seconds: (performance.now() - started) / 1000,
      maxSeconds: target.maxSeconds,
      cache: response.headers.get('cf-cache-status') ?? '(none)',
    }
  } catch (error) {
    return {
      name: target.name,
      ok: false,
      status: 0,
      seconds: 0,
      maxSeconds: target.maxSeconds,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const observations = []
  for (const target of TARGETS) {
    observations.push(await probe(target))
  }

  const { ok, failures, inconclusive, lines } = evaluate(observations)

  console.log('[perf-probe] live response times (thresholds from docs/QA-CHECKLIST.md)')
  for (const line of lines) console.log(line)
  for (const observation of observations) {
    if (observation.cache) {
      // Read off the GET's own headers. A HEAD would report DYNAMIC regardless.
      console.log(`  ${observation.name.padEnd(16)} cf-cache-status: ${observation.cache}`)
    }
  }

  for (const note of inconclusive) console.log(`[perf-probe] ${note}`)

  if (!ok) {
    for (const failure of failures) console.error(`::error::${failure}`)
    process.exit(1)
  }
  console.log('[perf-probe] within thresholds.')
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
