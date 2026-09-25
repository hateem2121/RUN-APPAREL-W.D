import {
  collectHeadlineNeighbours,
  collectIconBoxGroups,
  extractLeafRules,
  findBackdropFilters,
  findColouredEdges,
  findHeadlineBadges,
  findIconBoxRows,
  findUiKitFingerprints,
} from '../../../scripts/vibecoded-rules.mjs'
import { expect, type Page, test } from './offlineMedia'

/**
 * VC-07, VC-08, VC-10, VC-11, VC-12, VC-13 on the site — what a browser RECEIVES on each
 * public page: every CSS and JavaScript response, the inline `<style>` blocks (the site's CSS
 * rides inside the page since RO-08) and the rendered layout. Reading responses rather than
 * `.next/` is scoped by construction: Payload's admin CSS is never requested by these pages.
 * The rules and their planted-case controls: scripts/vibecoded-rules.mjs,
 * apps/cms/src/vibecodedRules.test.ts. The viewer's half: apps/viewer/e2e/vibecoded.spec.ts.
 */

const PAGES = ['/', '/products', '/contact', '/privacy', '/terms'] as const

async function load(page: Page, path: string) {
  const bodies: { url: string; text: string }[] = []
  page.on('response', async (response) => {
    const type = response.headers()['content-type'] ?? ''
    if (!/text\/css|javascript/.test(type)) return
    try {
      bodies.push({ url: response.url(), text: await response.text() })
    } catch {
      // A response the page abandoned has no body to read; it is not what was served.
    }
  })
  await page.goto(path, { waitUntil: 'networkidle' })
  const html = await page.content()
  const inlineCss = await page.evaluate(() =>
    [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n'),
  )
  const css = [inlineCss, ...bodies.filter((b) => /\.css(\?|$)/.test(b.url)).map((b) => b.text)]
  return { bodies, html, css: css.join('\n') }
}

for (const path of PAGES) {
  test.describe(`the site does not look machine-made (${path})`, () => {
    test('VC-07 / VC-08: no accent-stripe card and no frosted panel in the served CSS', async ({
      page,
    }) => {
      const { css } = await load(page, path)
      const rules = extractLeafRules(css)
      expect(rules.length, 'no CSS was collected, so nothing was checked').toBeGreaterThan(50)
      expect.soft(findColouredEdges(rules), 'a coloured accent stripe (VC-07)').toEqual([])
      expect.soft(findBackdropFilters(rules), 'a backdrop-filter (VC-08)').toEqual([])
    })

    test('VC-12 / VC-13: no Lucide, Tailwind, Radix or shadcn trace in what was served', async ({
      page,
    }) => {
      const { bodies, html } = await load(page, path)
      expect(bodies.length, 'no script or stylesheet response was collected').toBeGreaterThan(0)
      const found = [{ url: path, text: html }, ...bodies].flatMap((b) =>
        findUiKitFingerprints(b.text).map((f) => `${f.kit} in ${b.url}: …${f.context}…`),
      )
      expect.soft(found, 'a UI-kit fingerprint (VC-12 / VC-13)').toEqual([])
    })

    test('VC-10 / VC-11: no row of icon boxes, no pill badge above the headline', async ({
      page,
    }) => {
      await load(page, path)
      const groups = await page.evaluate(collectIconBoxGroups, 'main')
      expect(groups.length, 'the page had no multi-child containers to check').toBeGreaterThan(0)
      expect.soft(findIconBoxRows(groups), 'three icon boxes in a row (VC-10)').toEqual([])
      const neighbours = await page.evaluate(collectHeadlineNeighbours)
      expect(findHeadlineBadges(neighbours), 'a badge above the headline (VC-11)').toEqual([])
    })
  })
}
