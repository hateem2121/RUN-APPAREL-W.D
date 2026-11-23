import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beaconLoader } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import {
  BEACON_SRC,
  hasBeaconTag,
  PAGES,
  PAGES_ONLY_FLAG,
  probe,
} from '../../../scripts/beacon-probe.mjs'

/**
 * SO-12 — `hasBeaconTag` reads the WHOLE body rather than grepping line by line, because
 * the viewer's own embed (`apps/viewer/index.html`) writes `src=` and `data-cf-beacon=`
 * on separate lines of the same tag, and a single-line grep misses it entirely (a
 * single-line grep was tried first, and missed it).
 */
describe('hasBeaconTag', () => {
  it('finds a single-line embed', () => {
    expect(
      hasBeaconTag('<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>'),
    ).toBe(true)
  })

  it('finds an embed whose attributes span multiple lines', () => {
    const html = [
      '<script',
      '  src="https://static.cloudflareinsights.com/beacon.min.js"',
      '  data-cf-beacon=\'{"token": "abc"}\'',
      '></script>',
    ].join('\n')
    expect(hasBeaconTag(html)).toBe(true)
  })

  it('matches the beacon address literally — a dot is not "any character"', () => {
    // GitHub's code scan (CodeQL js/incomplete-hostname-regexp, 2026-10-01): the address
    // went into the pattern with its dots unescaped, so a look-alike host matched.
    expect(
      hasBeaconTag('<script src="https://staticXcloudflareinsights.com/beacon.min.js"></script>'),
    ).toBe(false)
  })

  it('is false when no beacon script is present', () => {
    expect(hasBeaconTag('<script src="/assets/index.js"></script>')).toBe(false)
  })

  /*
   * Since 2026-10-08 both sites add the beacon from an inline loader that skips automated
   * browsers (packages/shared/src/analyticsBeacon.ts). The probe must still see it, on the
   * garment page's real file and in what the website renders.
   */
  it('finds the inline loader, in the garment page and as the website renders it', () => {
    const viewer = readFileSync(
      join(import.meta.dirname, '..', '..', 'viewer', 'index.html'),
      'utf8',
    )
    expect(hasBeaconTag(viewer)).toBe(true)
    expect(hasBeaconTag(`<script>${beaconLoader('abc')}</script>`)).toBe(true)
  })

  it('refuses a loader that points at a look-alike host', () => {
    const fake = beaconLoader('abc').replace(
      'static.cloudflareinsights',
      'staticXcloudflareinsights',
    )
    expect(hasBeaconTag(`<script>${fake}</script>`)).toBe(false)
  })
})

/**
 * THE DEPLOY RUNS THIS PROBE BEHIND A NETWORK GUARD THAT BLOCKS (23 Nov 2026, run 45115732500).
 *
 * The first deploy with the probe in it passed both pages, then asked Cloudflare's script host
 * for the cookie check. The deploy job allows only the hosts it lists and that one is not
 * listed, so the request failed, the step exited 2, and the deploy stopped with nothing moved.
 * Uptime, in watch mode, had run the same command for weeks without a fault, which is why the
 * fixture here is the guard itself: a `fetch` that refuses every host the job does not list.
 */
describe('the probe inside the deploy job', () => {
  const ci = readFileSync(join(import.meta.dirname, '../../../.github/workflows/ci.yml'), 'utf8')
  const deployJob = ci.slice(ci.indexOf('\n  deploy:\n'))
  const allowed = (/allowed-endpoints: >-\n((?: {12}\S+\n)+)/.exec(deployJob)?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim().replace(/:\d+$/, ''))
    .filter(Boolean)
  const scriptHost = new URL(`https://${BEACON_SRC}`).hostname
  const page = '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>'

  /** The deploy job's guard: a host that is not on its list cannot be reached. */
  const guarded = (async (input: RequestInfo | URL) => {
    const host = new URL(String(input)).hostname
    if (!allowed.includes(host)) throw new TypeError('fetch failed')
    return new Response(page)
  }) as typeof fetch

  it('the job blocks, lists our own hosts, and does not list Cloudflare’s script host', () => {
    expect(deployJob).toContain('egress-policy: block')
    for (const url of PAGES) expect(allowed, url).toContain(new URL(url).hostname)
    expect(allowed).not.toContain(scriptHost)
  })

  it('with the flag it asks our pages only, and passes behind the guard', async () => {
    const asked: string[] = []
    const failures = await probe({
      fetchImpl: ((input: RequestInfo | URL) => {
        asked.push(new URL(String(input)).hostname)
        return guarded(input)
      }) as typeof fetch,
      pagesOnly: true,
      log: () => {},
    })
    expect(failures).toEqual([])
    expect(asked).toEqual(PAGES.map((url) => new URL(url).hostname))
  })

  it('negative control: without the flag the same guard stops it, as it stopped the deploy', async () => {
    await expect(probe({ fetchImpl: guarded, pagesOnly: false, log: () => {} })).rejects.toThrow(
      'fetch failed',
    )
  })

  it('negative control: a page with no tag still fails with the flag', async () => {
    const failures = await probe({
      fetchImpl: (async () => new Response('<html></html>')) as typeof fetch,
      pagesOnly: true,
      log: () => {},
    })
    expect(failures).toHaveLength(PAGES.length)
    expect(failures[0]).toContain('CF_ANALYTICS_TOKEN')
  })

  it('every use of the probe in the deploy job carries the flag', () => {
    const uses = deployJob.match(/node scripts\/beacon-probe\.mjs[^\n]*/g) ?? []
    expect(uses.length).toBeGreaterThan(0)
    for (const use of uses) expect(use).toContain(PAGES_ONLY_FLAG)
  })
})
