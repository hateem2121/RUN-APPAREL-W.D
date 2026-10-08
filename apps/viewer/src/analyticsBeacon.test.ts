import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BEACON_SRC, beaconLoader } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'

/**
 * The garment page's beacon loader is typed out in `index.html`, which is static; the website
 * renders the same loader from `beaconLoader` (packages/shared/src/analyticsBeacon.ts). This is
 * the tie between the two copies (2026-10-08).
 */
const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8')

/** The wear-run.com Web Analytics site's public tag (a site tag, not a secret). */
const TOKEN = '17250268831a423ea902fe766fa5feed'

describe('the garment page’s beacon', () => {
  it('is the shared loader, character for character', () => {
    // A classic script: Vite bundles an inline `type="module"` script out of the page (measured
    // on the build of 2026-10-08), and the beacon probe reads the page.
    expect(html).toContain(`<script>${beaconLoader(TOKEN)}</script>`)
  })

  it('is no longer a plain script tag that every browser, robots included, would run', () => {
    expect(html).not.toMatch(/<script[^>]*\ssrc="https:\/\/static\.cloudflareinsights\.com/)
    expect(html).not.toContain('data-cf-beacon')
  })
})

/*
 * What the loader DOES (a person gets the beacon; webdriver, HeadlessChrome and Lighthouse do
 * not) is run in a browser, on the built page under its own policy: `e2e/beaconLoader.spec.ts`.
 * It was run here in `node:vm` first, which CodeQL reports as hard-coded data interpreted as
 * code (PR #152); a browser is also the instrument that sees the policy.
 */
describe('the beacon loader, as text', () => {
  it('keeps a hostile token inside one string, with no way to close its script', () => {
    const hostile = 'x";alert(1);"</script>'
    const loader = beaconLoader(hostile)
    expect(loader).toContain(JSON.stringify(`${BEACON_SRC}?token=${encodeURIComponent(hostile)}`))
    expect(loader).not.toContain('<')
    expect(loader).not.toContain('alert(1);"')
  })
})
