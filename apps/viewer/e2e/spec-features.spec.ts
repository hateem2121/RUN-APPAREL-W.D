import { specGroups, specNote, type ViewerApiSuccess } from '@run-apparel/shared'
import { expect, type Page, test } from '@playwright/test'
import { stageFallsBack } from './stage'

/**
 * The garment's facts as four matching groups of bullets (polish D10, owner-approved 2026-10-03):
 * in the 3D window's corners on a computer, under the description everywhere else, and a bullet
 * with a line from the glossary opens to show it, one at a time.
 *
 * ⚠️ VA-59 STILL HOLDS (visual audit, 2026-10-02): each feature on its own line. Four invented
 * features, not the fixture's two, make the old " / "-joined string long enough to wrap, so
 * "each on its own line" is a real difference (tests-and-fixtures.md). Invented, so a test does
 * not carry a product's words; none is in the glossary, so they are plain bullets.
 */

const FEATURES = [
  'Four-way stretch knit',
  'Bonded flat seams',
  'Reflective trims on cuffs and hem',
  'Brushed inner face',
]

type Body = { product: ViewerApiSuccess['product'] & Record<string, unknown> }

/** Serve the fixture's garment with `edit` applied, as the CMS would send it. */
function serveEdited(page: Page, edit: (product: Body['product']) => void) {
  return page.route('**/api/public/viewer/**', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as Body
    edit(body.product)
    await route.fulfill({ response, json: body })
  })
}

const withFeatures = (performanceFeatures: string[]) => (product: Body['product']) => {
  product.performanceFeatures = performanceFeatures
  product.specs = specGroups({ ...product, performanceFeatures }, specNote)
}

const open = async (page: Page, width: number, height = 844) => {
  await page.setViewportSize({ width, height })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

test('the test server sends the facts the CMS would build from its fields (D10)', async ({
  page,
  request,
}) => {
  await open(page, 390)
  const api = new URL('/api/public/viewer/n001/wine', page.url())
  const body = (await (await request.get(api.href)).json()) as Body
  expect(body.product.specs, 'serve.mjs is out of step with specs.ts / specNotes.ts').toEqual(
    specGroups(body.product, specNote),
  )
  // A real control: the fixture has notes to show and terms the glossary lacks.
  const items = body.product.specs?.flatMap((group) => group.items) ?? []
  expect(items.filter((item) => item.note).length).toBeGreaterThan(0)
  expect(items.filter((item) => !item.note).length).toBeGreaterThan(0)
})

for (const width of [320, 390, 768] as const) {
  test(`each Performance feature starts on its own line at ${width}px (VA-59)`, async ({
    page,
  }) => {
    await serveEdited(page, withFeatures(FEATURES))
    await open(page, width)

    const m = await page.evaluate(() => {
      const group = document.querySelector('.spec-groups--list .spec-group--performance')
      const list = group?.querySelector('ul')
      const items = [...(group?.querySelectorAll('li') ?? [])]
      return {
        found: Boolean(group),
        words: items.map((item) => item.textContent),
        tops: items.map((item) => Math.round(item.getBoundingClientRect().top)),
        text: group?.querySelector('dd')?.textContent ?? '',
        bullets: list ? getComputedStyle(list).listStyleType : '',
        indent: list ? Number.parseFloat(getComputedStyle(list).paddingLeft) : -1,
      }
    })

    expect(m.found, 'no Performance group under the description').toBe(true)
    expect(m.words, 'the features changed, were reordered, or were lost').toEqual(FEATURES)
    expect(
      m.tops.every((top, index) => index === 0 || top > (m.tops[index - 1] ?? 0)),
      `two features share a line (tops: ${m.tops.join(', ')})`,
    ).toBe(true)
    expect(m.text, 'the features are still joined by a slash').not.toContain(' / ')
    expect(m.bullets, 'the browser draws its own bullets as well as ours').toBe('none')
    expect(m.indent, 'the list is indented').toBe(0)
  })
}

test('each group is a list a screen reader counts (VA-59, D10)', async ({ page }) => {
  await serveEdited(page, withFeatures(FEATURES))
  await open(page, 390)
  const performance = page.locator('.spec-group--performance').getByRole('list')
  await expect(performance, 'the features are not exposed as a list').toHaveCount(1)
  await expect(performance.getByRole('listitem')).toHaveCount(FEATURES.length)
  await expect(page.locator('.spec-groups--list').getByRole('list')).toHaveCount(4)
})

test('on a phone the groups mirror the corners: Fabric and Fit left, Weight and Performance right', async ({
  page,
}) => {
  await open(page, 390)
  const at = await page.evaluate(() =>
    Object.fromEntries(
      ['fabric', 'weight', 'fit', 'performance'].map((key) => {
        const r = document
          .querySelector(`.spec-groups--list .spec-group--${key}`)!
          .getBoundingClientRect()
        return [key, { left: r.left, top: r.top }]
      }),
    ),
  )
  expect(at.fabric!.left).toBe(at.fit!.left)
  expect(at.weight!.left).toBe(at.performance!.left)
  expect(at.weight!.left).toBeGreaterThan(at.fabric!.left)
  expect(at.fabric!.top).toBe(at.weight!.top)
  expect(at.fit!.top).toBeGreaterThan(at.fabric!.top)
  expect(at.fit!.top).toBe(at.performance!.top)
})

/**
 * Tapping a bullet opens its line and closes any other (one shared `<details name>`), and the
 * other bullets step back while it is open. At a phone width under the description and at a
 * computer width in the window's corners; skipped there where the stage has no 3D, because the
 * corners frame a garment and without one the facts are under the stage instead (LA-16).
 */
for (const [width, height, place] of [
  [390, 844, 'list'],
  [1440, 900, 'corners'],
] as const) {
  test(`a bullet opens its line, one at a time, in the ${place} (D10)`, async ({ page }) => {
    await open(page, width, height)
    const groups = page.locator(`.spec-groups--${place}`)
    if (place === 'corners') {
      test.skip(await stageFallsBack(page), 'no 3D here: the facts are under the stage (LA-16)')
      await expect(groups).toBeVisible()
    }
    const stretch = groups.locator('summary', { hasText: 'Four-way stretch' })
    const moisture = groups.locator('summary', { hasText: 'Moisture management' })
    const stretchNote = groups.locator('.spec-item__note', { hasText: 'every way you do' })
    const moistureNote = groups.locator('.spec-item__note', { hasText: 'keep you dry' })

    await expect(stretchNote, 'a note shows before its bullet is tapped').toBeHidden()
    await stretch.click()
    await expect(stretchNote).toBeVisible()
    if (place === 'corners') {
      // The window's own focus ring is for the 3D model; a pressed bullet must not outline it.
      const ring = await page
        .locator('.stage__canvas')
        .evaluate((el) => getComputedStyle(el).outlineStyle)
      expect(ring, 'clicking a bullet outlined the whole 3D window').toBe('none')
    }
    const noteSize = await stretchNote.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    )
    expect(noteSize, 'the note is read text, 12px at least (VA-11)').toBeGreaterThanOrEqual(12)

    // The others step back while one is open.
    await expect
      .poll(() =>
        groups
          .locator('li', { hasText: 'Moisture management' })
          .evaluate((li) => getComputedStyle(li).opacity),
      )
      .toBe('0.45')

    await moisture.click()
    await expect(moistureNote).toBeVisible()
    await expect(stretchNote, 'two notes open at once: the shared name is not working').toBeHidden()

    await moisture.click()
    await expect(moistureNote).toBeHidden()
    await expect
      .poll(() =>
        groups
          .locator('li', { hasText: 'Four-way stretch' })
          .evaluate((li) => getComputedStyle(li).opacity),
      )
      .toBe('1')
  })
}

test('a bullet opens from the keyboard (D10)', async ({ page }) => {
  await open(page, 390)
  const summary = page.locator('.spec-groups--list summary', { hasText: 'Moisture management' })
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.spec-item__note', { hasText: 'keep you dry' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('.spec-item__note', { hasText: 'keep you dry' })).toBeHidden()
})

test('an answer cached before the notes existed still lists every fact (D10)', async ({ page }) => {
  await serveEdited(page, (product) => {
    delete product.specs
  })
  await open(page, 390)
  const words = await page
    .locator('.spec-groups--list .spec-item__text')
    .evaluateAll((all) => all.map((el) => el.textContent))
  expect(words).toEqual([
    'Recycled polyester',
    'elastane',
    '160 GSM',
    'Athletic regular',
    'Moisture management',
    'Four-way stretch',
  ])
  await expect(page.locator('.spec-groups details'), 'a note with nothing to show').toHaveCount(0)
})
