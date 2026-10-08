import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
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

/**
 * The loader, run as a browser would run it: in a fresh context holding only a fake `navigator`
 * and `document`, recording what it adds to the head.
 */
type Added = { type?: string; src?: string }

function run(loader: string, navigator: { webdriver?: boolean; userAgent: string }): Added[] {
  const added: Added[] = []
  const document = {
    createElement: () => ({}) as Added,
    head: { append: (node: Added) => added.push(node) },
  }
  runInNewContext(loader, { navigator, document })
  return added
}

const PERSON =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

describe('the beacon loader, run', () => {
  const loader = beaconLoader(TOKEN)

  it('adds the beacon for a person, with the token in the address, as a module', () => {
    expect(run(loader, { webdriver: false, userAgent: PERSON })).toEqual([
      { type: 'module', src: `${BEACON_SRC}?token=${TOKEN}` },
    ])
  })

  it('adds nothing for an automated browser: webdriver, HeadlessChrome or Lighthouse', () => {
    expect(run(loader, { webdriver: true, userAgent: PERSON })).toEqual([])
    expect(run(loader, { userAgent: PERSON.replace('Chrome/141', 'HeadlessChrome/141') })).toEqual(
      [],
    )
    expect(run(loader, { userAgent: `${PERSON} Chrome-Lighthouse` })).toEqual([])
  })

  it('keeps a hostile token inside the address', () => {
    const [added] = run(beaconLoader('x";alert(1);"</script>'), { userAgent: PERSON })
    expect(added?.src).toBe(`${BEACON_SRC}?token=${encodeURIComponent('x";alert(1);"</script>')}`)
  })
})
