import { expect, test } from '@playwright/test'
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

/**
 * VC-07, VC-08, VC-10, VC-11, VC-12, VC-13 on the viewer — what a browser RECEIVES for a
 * product page: every CSS and JavaScript response (the app, <model-viewer> and three.js, the
 * decoders) and the rendered layout. The rules and their planted-case controls:
 * scripts/vibecoded-rules.mjs, apps/cms/src/vibecodedRules.test.ts. The site's half:
 * apps/cms/e2e/vibecoded.spec.ts.
 */
test.describe('the viewer does not look machine-made', () => {
  test('VC-07 / VC-08 / VC-12 / VC-13 in what was served; VC-10 / VC-11 in the layout', async ({
    page,
  }) => {
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
    await page.goto('/n001/wine', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const css = bodies.filter((b) => /\.css(\?|$)/.test(b.url)).map((b) => b.text)
    const rules = extractLeafRules(css.join('\n'))
    expect(rules.length, 'no CSS was collected, so nothing was checked').toBeGreaterThan(50)
    expect.soft(findColouredEdges(rules), 'a coloured accent stripe (VC-07)').toEqual([])
    // The one allowed use is really served, so an empty VC-08 result means the list held
    // rather than that no blur was read. Any OTHER blur is VC-08's to report.
    expect.soft(findBackdropFilters(rules, []).map((r) => r.selector)).toContain('.stage__ar')
    expect.soft(findBackdropFilters(rules), 'a backdrop-filter (VC-08)').toEqual([])

    const scripts = bodies.filter((b) => !/\.css(\?|$)/.test(b.url))
    expect(scripts.length, 'no script response was collected').toBeGreaterThan(0)
    const found = [{ url: page.url(), text: await page.content() }, ...bodies].flatMap((b) =>
      findUiKitFingerprints(b.text).map((f) => `${f.kit} in ${b.url}: …${f.context}…`),
    )
    expect.soft(found, 'a UI-kit fingerprint (VC-12 / VC-13)').toEqual([])

    const groups = await page.evaluate(collectIconBoxGroups, 'main')
    expect(groups.length, 'the page had no multi-child containers to check').toBeGreaterThan(0)
    expect.soft(findIconBoxRows(groups), 'three icon boxes in a row (VC-10)').toEqual([])
    const neighbours = await page.evaluate(collectHeadlineNeighbours)
    expect(
      neighbours.length,
      'nothing sits before the h1, so VC-11 checked nothing',
    ).toBeGreaterThan(0)
    expect(findHeadlineBadges(neighbours), 'a badge above the headline (VC-11)').toEqual([])
  })
})
