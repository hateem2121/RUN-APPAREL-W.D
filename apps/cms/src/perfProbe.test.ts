import { describe, expect, it } from 'vitest'
import { LIVE_PRODUCTS } from '../../../scripts/live-products.mjs'
import { TARGETS, evaluate } from '../../../scripts/perf-probe.mjs'

/**
 * Tests for the live performance probe.
 *
 * THE MOST IMPORTANT ONE IS THE 403 CASE, and it is the least obvious. Root
 * CLAUDE.md: "Anything CI fetches from a wear-run.help host can 403 from a runner.
 * Free-plan Bot Fight Mode intermittently blocks datacenter traffic … Treat such a
 * 403 as *inconclusive*, never as a failed assertion." It has already forced an API
 * cutover to be rolled back within the hour, and later failed a deploy through a
 * check that read the 403 as "no model".
 *
 * If this probe treated a 403 as a regression it would open an issue on Cloudflare's
 * mood rather than on the site's speed — and an alert that cries wolf gets muted,
 * which is exactly how the uptime check sat silently disabled for 17 days.
 *
 * The thresholds themselves are asserted to sit ABOVE the measured live numbers.
 * A threshold below what production already does is an alert that is on from the
 * moment it ships, which is the same failure in a different costume.
 */

type Observation = {
  name: string
  ok: boolean
  status: number
  seconds: number
  maxSeconds: number
  error?: string
}

const observation = (over: Partial<Observation> = {}): Observation => ({
  name: 'viewer HTML',
  ok: true,
  status: 200,
  seconds: 0.8,
  maxSeconds: 2.5,
  ...over,
})

describe('evaluate', () => {
  it('passes when every target is inside its threshold', () => {
    const result = evaluate([observation(), observation({ name: 'health', seconds: 0.4 })])

    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('fails a target that is over its threshold, naming the numbers', () => {
    const result = evaluate([observation({ seconds: 4.2 })])

    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('4.20s')
    expect(result.failures[0]).toContain('2.5s')
  })

  it.each([403, 429, 503])('treats HTTP %s as INCONCLUSIVE rather than a regression', (status) => {
    const result = evaluate([observation({ ok: false, status })])

    // Not merely "does not fail" — it must also not be counted as a pass with a
    // silent gap. It is reported, and the run stays green.
    expect(result.ok, 'Bot Fight Mode must never open a performance issue').toBe(true)
    expect(result.failures).toEqual([])
    expect(result.inconclusive).toHaveLength(1)
    expect(result.inconclusive[0]).toContain(String(status))
  })

  it('treats a network error as inconclusive too', () => {
    const result = evaluate([observation({ ok: false, status: 0, error: 'ENOTFOUND' })])

    expect(result.ok).toBe(true)
    expect(result.inconclusive[0]).toContain('ENOTFOUND')
  })

  it('DOES fail on a genuine error status, so inconclusive is not a blanket amnesty', () => {
    // The negative control for the rule above. 500 and 404 are real problems; if the
    // inconclusive branch swallowed everything, this probe would never report
    // anything at all.
    for (const status of [404, 500, 502]) {
      const result = evaluate([observation({ ok: false, status })])
      expect(result.ok, `HTTP ${status} must fail`).toBe(false)
    }
  })

  it('reports every target rather than stopping at the first failure', () => {
    const result = evaluate([
      observation({ name: 'a', seconds: 99 }),
      observation({ name: 'b', seconds: 99 }),
    ])

    expect(result.failures).toHaveLength(2)
    expect(result.lines).toHaveLength(2)
  })
})

describe('targets', () => {
  /**
   * ⚠️ ASSERTS COVERAGE OF EVERY LIVE PRODUCT, NOT TWO FIXED NAMES — L10-08,
   * 2026-08-31. This used to check for the literals 'viewer HTML' and 'product API',
   * which is exactly what the old TARGETS produced while timing only `rxps`. A test
   * naming the same single product the code names cannot notice that the second live
   * garment is measured by nothing. Derived from LIVE_PRODUCTS, it fails the day a
   * garment is added to the catalogue and not to the probe.
   */
  it('probes BOTH endpoints for every live product, plus health', () => {
    const names = (TARGETS as { name: string }[]).map((t) => t.name)
    for (const { slug } of LIVE_PRODUCTS) {
      expect(names, `no viewer timing for ${slug}`).toContain(`viewer ${slug}`)
      expect(names, `no API timing for ${slug}`).toContain(`API ${slug}`)
    }
    expect(names).toContain('health')
    expect(TARGETS).toHaveLength(LIVE_PRODUCTS.length * 2 + 1)
  })

  it('never GETs the model — 27 MB against a $5/month egress cap', () => {
    // The rule is enforced by ABSENCE, so assert the absence explicitly. A future
    // target pointing at media.wear-run.help would turn a weekly check into
    // gigabytes of R2 egress, and the bill is the first sign.
    const hosts = (TARGETS as { host: string }[]).map((t) => t.host)
    expect(hosts.some((h) => h.includes('media.wear-run.help'))).toBe(false)
  })

  /**
   * Every threshold must sit above the number production already achieves, measured
   * live on 2026-08-13 and recorded in docs/QA-CHECKLIST.md:
   *   viewer HTML  0.47–0.92 s
   *   product API  2.1–3.7 s   (slow BY DESIGN — a Worker's own response does not
   *                             pass through the edge cache, so s-maxage buys nothing)
   */
  it.each([
    ['viewer', 0.92],
    ['API', 3.7],
  ])('gives every %s target headroom above its measured worst case', (kind, measuredWorst) => {
    const matching = (TARGETS as { name: string; maxSeconds: number }[]).filter((t) =>
      t.name.startsWith(`${kind} `),
    )
    // One per live product — if this is ever zero the loop below asserts nothing.
    expect(matching, `no ${kind} targets at all`).toHaveLength(LIVE_PRODUCTS.length)
    for (const target of matching) {
      expect(
        target.maxSeconds,
        `${target.name}: a threshold at or below the measured ${measuredWorst}s would alert from the day it ships.`,
      ).toBeGreaterThan(measuredWorst)
    }
  })
})
