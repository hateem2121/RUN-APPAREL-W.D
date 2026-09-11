import { expect, type Page, test } from '@playwright/test'

/**
 * The page must not jump when the real fonts arrive.
 *
 * Measured on the live site on 2026-09-11: /products scored CLS 0.404 at 1350px and 0.212 at
 * 390px. The headline paints first in a local stand-in face (the `… Fallback` @font-face rules in
 * `src/app/(frontend)/site.css`); when Archivo or Instrument Serif arrives it is a different
 * width, wraps to a different number of lines, and pushes everything under it.
 * `scripts/calibrate-fallback.mjs` measures what each headline's stand-in would need; this file
 * proves the result the way a visitor gets it — fonts blocked, fonts delivered, fonts late.
 *
 * ⚠️ ONE NAVIGATION PER WIDTH, NEVER A RESIZE. Measured 2026-09-11 in Chromium 151, WebKit 26.5
 * and Firefox 153: straight after `page.setViewportSize`, `innerWidth` already reports the new
 * width while every `vw` length still resolves against the OLD one — at 390px the hero's padding
 * read 140.8px, 11vw of the previous 1280, and the home headline came back on five lines. Half a
 * second later, and on a fresh navigation, both were exact. The first version of this file
 * resized one page 390 → 1350 → 1440 and reported a 412px lede jump that did not exist. The
 * font-size check below proves every reading was laid out for its own width.
 *
 * ⚠️ LINES ARE COUNTED FROM WORD POSITIONS, NOT FROM THE BOX HEIGHT. A `min-height` reservation
 * would hold the box at two lines in either font and hide a one-to-two reflow inside it (the
 * 2026-09-08 attempt at this fix had exactly that blind spot), and per-character rects split one
 * visual line in two, because the serif accent renders at 1.07em.
 *
 * WebKit runs this file too (`playwright.config.ts` → `fontswap-webkit`): the stand-ins measure
 * differently per engine, and WebKit — the engine behind a QR scan on an iPhone — ignores
 * `ascent-override`.
 */

const FONT_FILES = /\.(woff2?|ttf|otf)(\?.*)?$/
const PAGES = ['/', '/products', '/contact'] as const
/**
 * 390: a phone. 1280: a common laptop, where the column is already at its 1052px cap but the
 * headline's type is still scaling with the window. 1350: Lighthouse's desktop profile, where
 * /products measured CLS 0.404. 1680: past the 1600px breakpoint where the page widens to a
 * 1312px column (FA-E-04).
 */
const WIDTHS = [390, 1280, 1350, 1680] as const
/**
 * Slack between the two fonts when the lines agree: up to 9px in WebKit (it ignores
 * `ascent-override`) and 0–0.5px in Chromium and Firefox, measured 2026-09-11. The jumps this
 * guards against measured 31px on a phone and 66px on a desktop.
 */
const LEDE_TOLERANCE_PX = 12

/**
 * The site hero's `clamp(min(2.125rem, 9.8vw), 5.4vw, 4.5rem)` at `width` — `.site-hero
 * .display--hero` in src/app/(frontend)/site.css, which lowers base.css's 34px floor below 347px.
 */
const heroFontSize = (width: number) =>
  Math.min(72, Math.max(Math.min(34, width * 0.098), width * 0.054))

interface Reading {
  lines: number
  breaks: string
  ledeTop: number
  fontSize: number
  archivoLoaded: boolean
}

async function snapshot(page: Page, path: string, blockFonts: boolean) {
  await page.unroute(FONT_FILES).catch(() => undefined)
  if (blockFonts) await page.route(FONT_FILES, (route) => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const readings: Record<number, Reading | null> = {}
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(path)
    await Promise.race([
      page.evaluate(() => document.fonts.ready.then(() => true)),
      page.waitForTimeout(3000),
    ])
    readings[width] = await page.evaluate((): Reading | null => {
      const h1 = document.querySelector('.site-hero h1.display--hero')
      const lede = document.querySelector('.site-hero .site-lede')
      if (!h1 || !lede) return null
      const words: { text: string; mid: number }[] = []
      const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const value = node.nodeValue ?? ''
        const re = /\S+/g
        for (let match = re.exec(value); match; match = re.exec(value)) {
          const range = document.createRange()
          range.setStart(node, match.index)
          range.setEnd(node, match.index + match[0].length)
          const rect = range.getBoundingClientRect()
          if (rect.width > 0) words.push({ text: match[0], mid: rect.top + rect.height / 2 })
        }
      }
      const fontSize = Number.parseFloat(getComputedStyle(h1).fontSize)
      const tolerance = (fontSize * 0.92) / 2
      const lines: string[][] = []
      let lineMid = Number.NEGATIVE_INFINITY
      for (const word of words) {
        if (Math.abs(word.mid - lineMid) > tolerance) {
          lines.push([])
          lineMid = word.mid
        }
        lines[lines.length - 1]?.push(word.text)
      }
      return {
        lines: lines.length,
        breaks: lines.map((line) => line.join(' ')).join(' / '),
        ledeTop: Math.round(lede.getBoundingClientRect().top),
        fontSize,
        archivoLoaded: [...document.fonts].some(
          (face) =>
            face.family.replaceAll('"', '') === 'Archivo Variable' && face.status === 'loaded',
        ),
      }
    })
  }
  return readings
}

test.describe('PF-03 — the headline keeps its lines when the real fonts arrive', () => {
  for (const path of PAGES) {
    test(`${path}: the same lines, and the lede holds still, fonts blocked vs delivered`, async ({
      page,
    }) => {
      const stand = await snapshot(page, path, true)
      const real = await snapshot(page, path, false)
      for (const width of WIDTHS) {
        const before = stand[width]
        const after = real[width]
        if (!before || !after) throw new Error(`${path} ${width}px: no hero headline or lede`)
        // The instrument: laid out for THIS width, and each state used the fonts it claims to.
        expect(
          before.fontSize,
          `${path} ${width}px: stand-in not laid out at this width`,
        ).toBeCloseTo(heroFontSize(width), 0)
        expect(
          after.fontSize,
          `${path} ${width}px: real font not laid out at this width`,
        ).toBeCloseTo(heroFontSize(width), 0)
        expect(before.archivoLoaded, `${path} ${width}px: the blocked load got Archivo`).toBe(false)
        expect(after.archivoLoaded, `${path} ${width}px: Archivo never loaded`).toBe(true)
        test.info().annotations.push({
          type: `${path} ${width}px`,
          description: `stand-in "${before.breaks}" (lede ${before.ledeTop}) · real "${after.breaks}" (lede ${after.ledeTop})`,
        })
        // Soft, so one run reports every page and width that disagrees rather than the first.
        expect
          .soft(
            after.lines,
            `${path} ${width}px: "${before.breaks}" in the stand-in, "${after.breaks}" in the ` +
              'real font — the stand-in no longer matches the real width',
          )
          .toBe(before.lines)
        expect
          .soft(
            Math.abs(after.ledeTop - before.ledeTop),
            `${path} ${width}px: the lede sits at ${before.ledeTop}px in the stand-in and ` +
              `${after.ledeTop}px in the real font — everything under the headline moved`,
          )
          .toBeLessThanOrEqual(LEDE_TOLERANCE_PX)
      }
    })
  }
})

test.describe('PF-03 — the layout-shift score while the fonts swap in', () => {
  const installObserver = (page: Page) =>
    page.addInitScript(() => {
      const store = window as unknown as { __cls: number }
      store.__cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as unknown as { hadRecentInput: boolean; value: number }
          if (!shift.hadRecentInput) store.__cls += shift.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
  const readCls = (page: Page) =>
    page.evaluate(() => (window as unknown as { __cls: number }).__cls ?? 0)

  test('the instrument reports a planted shift (negative control)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the Layout Instability API is Chromium-only')
    await installObserver(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
      const block = document.createElement('div')
      block.style.height = '300px'
      document.querySelector('main')?.prepend(block)
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    expect(
      await readCls(page),
      'a 300px block pushed the page and the observer saw nothing',
    ).toBeGreaterThan(0.1)
  })

  for (const path of PAGES) {
    for (const width of [390, 1350]) {
      test(`${path} at ${width}px stays at or under 0.02 while the fonts arrive late`, async ({
        page,
        browserName,
      }) => {
        test.skip(browserName !== 'chromium', 'the Layout Instability API is Chromium-only')
        await installObserver(page)
        /*
         * ⚠️ THE DELAY IS THE TEST, NOT AN INCONVENIENCE. Local `.woff2` files load fast enough
         * off disk to beat `font-display: swap`'s ~100ms block period — no stand-in paints, no swap
         * happens, and a broken metric match passes by accident. Holding every font response past
         * that period forces the two-paint sequence a visitor on a cold cache gets.
         */
        await page.route(FONT_FILES, async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 150))
          await route.continue()
        })
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        await page.evaluate(() => document.fonts.ready.then(() => true))
        await page.waitForTimeout(300)
        expect(
          await readCls(page),
          `layout shift at ${width}px while the fonts swapped in`,
        ).toBeLessThanOrEqual(0.02)
      })
    }
  }
})
