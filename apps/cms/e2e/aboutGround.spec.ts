import { expect, type Page, test } from './offlineMedia'
import { contrastOf } from '../../../scripts/contrast-rules.mjs'

/**
 * D41 (owner, option C, 2026-10-15/16): №01 stands on the roof photo, under a dark wash, with the
 * words on the left and the four figures on the right (AboutSection.tsx, site.css `.about-ground`).
 *
 * axe cannot compute contrast over a photograph, so this does the arithmetic the stylesheet's
 * comment does, with the page's own numbers: it reads the wash's stops back from the browser,
 * finds the thinnest wash under each piece of text, and puts the worst pixel the photo could
 * show there, pure white, under it. What would have to break: a wash thinned where words sit (C's
 * picture had 35% on the right), a word set in `--muted` over the thin side, or the section's own
 * dark colours lost in the light theme (the photo hero's measured trap, site.css).
 */

const settle = async (page: Page, width: number, scheme: 'light' | 'dark' = 'light') => {
  await page.setViewportSize({ width, height: 900 })
  // Firefox loses an `emulateMedia` made before the first navigation (legibility.spec.ts).
  await page.goto('/')
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.about-ground').scrollIntoViewIfNeeded()
}

/** The wash's opacity along the section, as [position 0–1, alpha] stops, and its ink. */
type Wash = {
  stops: [number, number][]
  ink: [number, number, number]
  left: number
  width: number
}

const COLOUR = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)\)(?: ([\d.]+)%)?/g

async function readWash(page: Page): Promise<Wash> {
  const raw = await page.evaluate(() => {
    const photo = document.querySelector('.about-ground__photo') as Element
    const style = getComputedStyle(photo, '::after')
    const box = photo.getBoundingClientRect()
    return {
      image: style.backgroundImage,
      colour: style.backgroundColor,
      left: box.left,
      width: box.width,
    }
  })
  // Every engine reports a `color-mix()` stop as `color(srgb r g b / alpha)` (read 2026-10-16).
  const found = [...(raw.image === 'none' ? raw.colour : raw.image).matchAll(COLOUR)]
  expect(
    found.length,
    `no wash colour could be read from ${raw.image} / ${raw.colour}`,
  ).toBeGreaterThan(0)
  const stops = found.map((match, index): [number, number] => [
    match[5] === undefined ? index / Math.max(1, found.length - 1) : Number(match[5]) / 100,
    Number(match[4]),
  ])
  // One flat colour: the same wash from edge to edge.
  if (stops.length === 1) stops.push([1, stops[0]?.[1] ?? 0])
  const first = found[0] as RegExpMatchArray
  const ink = [1, 2, 3].map((i) => Math.round(Number(first[i]) * 255)) as [number, number, number]
  return { stops, ink, left: raw.left, width: raw.width }
}

/** The thinnest wash between two points across the section (it is straight between stops). */
function thinnest(wash: Wash, from: number, to: number): number {
  const at = (x: number) => {
    const [first, ...rest] = wash.stops
    let previous = first as [number, number]
    for (const stop of rest) {
      if (x <= stop[0]) {
        const span = stop[0] - previous[0] || 1
        return previous[1] + ((x - previous[0]) / span) * (stop[1] - previous[1])
      }
      previous = stop
    }
    return previous[1]
  }
  const inside = wash.stops.map(([x]) => x).filter((x) => x > from && x < to)
  return Math.min(...[from, to, ...inside].map(at))
}

/** Each piece of text, the contrast it needs, and how it reads over pure white under the wash. */
async function readings(page: Page) {
  const wash = await readWash(page)
  const parts = await page.evaluate(() =>
    (
      [
        ['.about-ground .section-number', 4.5],
        ['.about-ground h2', 3],
        ['.about-ground .serif-accent', 3],
        ['.about-ground .site-lede', 4.5],
        ['.about-ground .btn--ghost', 4.5],
        ['.about-ground .fact__label', 4.5],
        ['.about-ground .fact__value', 3],
      ] as const
    ).flatMap(([selector, needs]) =>
      [...document.querySelectorAll(selector)].map((el, index) => {
        const box = el.getBoundingClientRect()
        return {
          name: `${selector} #${index + 1}`,
          needs,
          colour: getComputedStyle(el).color,
          left: box.left,
          right: box.right,
        }
      }),
    ),
  )
  return parts.map((part) => {
    const alpha = thinnest(
      wash,
      (part.left - wash.left) / wash.width,
      (part.right - wash.left) / wash.width,
    )
    const worst = wash.ink.map((c) => Math.round(alpha * c + (1 - alpha) * 255))
    return { ...part, alpha, ratio: contrastOf(part.colour, `rgb(${worst.join(', ')})`) }
  })
}

const failing = (list: Awaited<ReturnType<typeof readings>>) =>
  list
    .filter((part) => part.ratio < part.needs)
    .map(
      (part) =>
        `${part.name}: ${part.ratio.toFixed(2)}:1 over white under a ${Math.round(part.alpha * 100)}% wash, needs ${part.needs}`,
    )

test.describe('D41 — №01 on the roof photo: every word reads over the brightest pixel', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const width of [390, 1440, 2560]) {
      test(`${scheme}, ${width}px: words, labels, figures and the link all clear AA`, async ({
        page,
      }) => {
        await settle(page, width, scheme)
        const list = await readings(page)
        expect(list.length, 'no text was read, so nothing was measured').toBeGreaterThan(10)
        expect(failing(list)).toEqual([])
      })
    }
  }

  // NEGATIVE CONTROL: C's picture's wash, 35% at the right edge, under the same figures.
  test('sees the fault: the wash thinned to 35% where the figures sit', async ({ page }) => {
    await settle(page, 1440)
    await page.addStyleTag({
      content:
        '.about-ground__photo::after { background: linear-gradient(to right, color-mix(in srgb, var(--bg) 92%, transparent) 0%, color-mix(in srgb, var(--bg) 78%, transparent) 48%, color-mix(in srgb, var(--bg) 35%, transparent) 100%) !important; }',
    })
    await expect.poll(async () => failing(await readings(page)).length).toBeGreaterThan(0)
  })
})

/**
 * The join between the photo hero and №01 (home page audit, 2026-10-17). Two things drew a light
 * line there: the hero's bottom rule (light in the dark token set) and №01's whole section rising
 * 24px as it entered, which uncovered the paper page between two dark photos — 24px on a 320x658
 * phone at load. Read at load and at two points of the rise, with motion ON, since a reduced-motion
 * run never rises and would pass on the old code.
 */
const joinGaps = async (page: Page) => {
  const out: { at: string; gap: number; rule: string }[] = []
  for (const share of [null, 0.8, 0.5] as const) {
    if (share !== null) {
      await page.evaluate((s) => {
        const hero = document.querySelector('.site-hero') as HTMLElement
        const bottom = hero.offsetTop + hero.offsetHeight
        window.scrollTo({ top: Math.max(0, bottom - window.innerHeight * s), behavior: 'instant' })
      }, share)
      // Two frames for the scroll timeline to apply its new progress.
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      )
    }
    out.push(
      await page.evaluate(
        (at) => {
          const hero = document.querySelector('.site-hero') as Element
          const ground = document.querySelector('.about-ground') as Element
          return {
            at,
            gap: ground.getBoundingClientRect().top - hero.getBoundingClientRect().bottom,
            rule: getComputedStyle(hero).borderBottomWidth,
          }
        },
        share === null ? 'load' : `hero bottom at ${share * 100}% of the screen`,
      ),
    )
  }
  return out
}

const openWithMotion = async (page: Page, width: number, height: number) => {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
}

test.describe('№01 meets the hero: no light line, no gap', () => {
  for (const [width, height] of [
    [320, 658],
    [390, 844],
    [1280, 720],
  ] as const) {
    test(`${width}x${height}: the two photos touch at load and while №01 rises`, async ({
      page,
    }) => {
      await openWithMotion(page, width, height)
      const gaps = await joinGaps(page)
      for (const read of gaps) {
        expect(Math.abs(read.gap), `a ${read.gap.toFixed(2)}px gap at ${read.at}`).toBeLessThan(0.5)
        expect(read.rule, `the hero still draws its bottom rule at ${read.at}`).toBe('0px')
      }
    })
  }

  // NEGATIVE CONTROL: the section rises again, as it did before. Only an engine that runs scroll
  // timelines can rise at all (Firefox, 2026-10-17, does not), so the control needs one.
  test('sees the fault: №01 rising as a whole opens a gap', async ({ page }) => {
    await openWithMotion(page, 320, 658)
    const rises = await page.evaluate(() => CSS.supports('animation-timeline: view()'))
    test.skip(!rises, 'this engine runs no scroll timeline, so nothing rises')
    await page.addStyleTag({
      content:
        '.about-ground { animation: site-reveal var(--settle) var(--ease-out-expo) both; animation-timeline: view(); animation-range: entry 0% entry 60%; }',
    })
    await expect.poll(async () => (await joinGaps(page))[0]?.gap ?? 0).toBeGreaterThan(1)
  })
})

test.describe('D41 — №01 lays out on its photo', () => {
  test('on a computer the words take the left and the figures the right, on one photo', async ({
    page,
  }) => {
    await settle(page, 1440)
    const boxes = await page.evaluate(() => {
      const box = (selector: string) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect()
        return rect
          ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
          : null
      }
      return {
        section: box('.about-ground'),
        photo: box('.about-ground__photo'),
        words: box('.about-ground .about__copy'),
        figures: box('.about-ground .about__points'),
        images: [...document.querySelectorAll('.about-ground img')].map((img) =>
          img.getAttribute('src'),
        ),
      }
    })
    expect(boxes.images).toHaveLength(1)
    expect(boxes.images[0]).toMatch(/^\/factory\/solar-roof-/)
    expect(boxes.section && boxes.photo && boxes.words && boxes.figures).toBeTruthy()
    if (!boxes.section || !boxes.photo || !boxes.words || !boxes.figures) return
    // The photo is the whole section's ground.
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      expect(Math.abs(boxes.photo[side] - boxes.section[side]), side).toBeLessThanOrEqual(1)
    }
    expect(boxes.figures.left, 'the figures are not beside the words').toBeGreaterThanOrEqual(
      boxes.words.right,
    )
  })

  test('on a phone the figures come under the words, and nothing runs past the screen', async ({
    page,
  }) => {
    await settle(page, 390)
    const read = await page.evaluate(() => ({
      words:
        document.querySelector('.about-ground .about__copy')?.getBoundingClientRect().bottom ?? 0,
      figures:
        document.querySelector('.about-ground .about__points')?.getBoundingClientRect().top ?? 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    expect(read.figures, 'the figures are not under the words').toBeGreaterThanOrEqual(read.words)
    expect(read.overflow, 'the page scrolls sideways').toBe(0)
  })
})
