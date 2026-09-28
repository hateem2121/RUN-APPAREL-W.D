import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_HOST } from '../siteHostRules.mjs'
import { forwardsToViewer, VIEWER_FILES, VIEWER_FOLDERS } from '../viewerForward.mjs'

/**
 * Which requests the website hands to the viewer Worker (domain move, 2026-09-28).
 * worker.mjs applies the decision; everything it decides lives in viewerForward.mjs.
 */
const at = (path: string, host = SITE_HOST) => forwardsToViewer(new URL(`https://${host}${path}`))

const repo = join(import.meta.dirname, '..', '..', '..')
const entries = (dir: string) => readdirSync(join(repo, dir))

describe('forwardsToViewer', () => {
  it('hands every garment page shape to the viewer', () => {
    expect(at('/products/rxps/wine')).toBe(true)
    expect(at('/products/rxps/wine/')).toBe(true)
    expect(at('/products/rxps')).toBe(true)
  })

  it('keeps the listing and anything deeper with the website', () => {
    expect(at('/products')).toBe(false)
    expect(at('/products/')).toBe(false)
    expect(at('/products/rxps/wine/extra')).toBe(false)
    // A path that merely STARTS with the word is not in the folder.
    expect(at('/productsx/rxps')).toBe(false)
  })

  it("hands the viewer's own files to it, and nothing of the website's", () => {
    expect(at('/assets/index-AAAA.js')).toBe(true)
    expect(at('/og/rxps/wine.jpg')).toBe(true)
    expect(at('/meshopt_decoder.js')).toBe(true)
    expect(at('/sw.js')).toBe(true)
    expect(at('/')).toBe(false)
    expect(at('/_next/static/chunks/main.js')).toBe(false)
    expect(at('/og-default.png')).toBe(false)
    expect(at('/favicon.ico')).toBe(false)
    expect(at('/contact')).toBe(false)
  })

  /**
   * ⚠️ ONLY THE SITE'S OWN ADDRESS. www. must still be redirected to it by the host
   * rules, which run INSIDE Next — a forward from this wrapper happens first and would
   * serve the garment on www. instead. And cms. is the admin host.
   */
  it('forwards only on the site address, never on www. or the admin host', () => {
    expect(at('/products/rxps/wine', `www.${SITE_HOST}`)).toBe(false)
    expect(at('/products/rxps/wine', 'cms.wear-run.help')).toBe(false)
    expect(at('/assets/index-AAAA.js', 'cms.wear-run.help')).toBe(false)
  })
})

describe('the two apps never claim the same address', () => {
  /**
   * Every file the viewer ships from public/ must either be forwarded, or be one the
   * website serves in its place. A viewer file that is neither would 404 on the website
   * while working on the old host — invisible until a garment page lost its decoder.
   */
  const LEFT_TO_THE_WEBSITE = [
    'favicon.ico', // byte-identical in both apps, asserted below
    'apple-touch-icon.png', // byte-identical in both apps, asserted below
    'robots.txt', // the website's own robots.txt speaks for the whole host
    'sitemap.xml', // the website's own sitemap
    'llms.txt', // the website's own llms.txt
    '_redirects', // deleted by CI before deploy; never served
  ]

  it("covers every file in the viewer's public folder", () => {
    for (const name of entries('apps/viewer/public')) {
      if (LEFT_TO_THE_WEBSITE.includes(name)) continue
      expect(
        VIEWER_FOLDERS.includes(`/${name}/`) || VIEWER_FILES.includes(`/${name}`),
        `apps/viewer/public/${name} is neither forwarded nor served by the website`,
      ).toBe(true)
    }
  })

  it('serves the icons the website answers for garment pages byte-for-byte as the viewer would', () => {
    for (const name of ['favicon.ico', 'apple-touch-icon.png']) {
      expect(
        readFileSync(join(repo, 'apps/cms/public', name), 'base64'),
        `${name} differs between the apps, so garment pages on the website would show the website's`,
      ).toBe(readFileSync(join(repo, 'apps/viewer/public', name), 'base64'))
    }
  })

  it("never forwards one of the website's own files or pages", () => {
    const website = [
      ...entries('apps/cms/public'),
      ...entries('apps/cms/src/app/(frontend)').filter((name) => !name.includes('.')),
    ]
    for (const name of website) {
      expect(at(`/${name}`), `/${name} belongs to the website`).toBe(false)
      // The one shared folder, on purpose: the listing is the website's, the garments
      // inside it are the viewer's (tested above).
      if (name === 'products') continue
      expect(at(`/${name}/x`), `/${name}/… belongs to the website`).toBe(false)
    }
  })

  it('negative control: the collision check does see a clash', () => {
    // If the website ever gained an `assets` folder, the check above must name it.
    expect(at('/assets/x')).toBe(true)
  })
})
