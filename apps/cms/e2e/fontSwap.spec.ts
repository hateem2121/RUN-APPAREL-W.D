import { expect, type Page, test } from './offlineMedia'

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
 * 390: a phone. 1280: a common laptop, where the headline's type is still scaling with the window
 * (and, since polish D1, the page is the screen's width: a 1152px column). 1350: Lighthouse's
 * desktop profile, where /products measured CLS 0.404. 1680: a 1312px column (1440px wide from 1280px
 * since D1; from 1600px under FA-E-04 before it).
 */
const WIDTHS = [390, 1280, 1350, 1680] as const
/**
 * Slack between the two fonts when the lines agree: up to 9px in WebKit (it ignores
 * `ascent-override`) and 0–0.5px in Chromium and Firefox, measured 2026-09-11. The jumps this
 * guards against measured 31px on a phone and 66px on a desktop.
 */
const LEDE_TOLERANCE_PX = 12

/**
 * The site hero's `clamp(min(2.125rem, 9.6vw), 5.4vw, 4.5rem)` at `width` — `.site-hero
 * .display--hero` in src/app/(frontend)/site.css, which lowers base.css's 34px floor below 355px.
 */
const heroFontSize = (width: number) =>
  Math.min(72, Math.max(Math.min(34, width * 0.096), width * 0.054))

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
      const store = window as unknown as { __cls: number; __moved: string[] }
      store.__cls = 0
      store.__moved = []
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as unknown as {
            hadRecentInput: boolean
            value: number
            sources?: { node?: Node | null }[]
          }
          if (shift.hadRecentInput) continue
          store.__cls += shift.value
          // What moved, so a failure names the element instead of only a number.
          for (const source of shift.sources ?? []) {
            const node = source.node
            const el = node instanceof Element ? node : node?.parentElement
            if (el) store.__moved.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
          }
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
  const readCls = (page: Page) =>
    page.evaluate(() => (window as unknown as { __cls: number }).__cls ?? 0)
  const readMoved = (page: Page) =>
    page.evaluate(() => [...new Set((window as unknown as { __moved: string[] }).__moved ?? [])])

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

  /*
   * ⚠️ THE TEXT-HEAVY PAGES JOINED 2026-10-01, at 768 too. The visual audit measured them on
   * the live site, where nothing had: Lighthouse mobile scored the printing guide 0.233 and named
   * the Archivo and Instrument Serif files as the cause, and /privacy reached 0.2136 at 768x1024
   * on one cold load and 0 with the webfonts blocked. A page that is mostly paragraphs adds up a
   * small width difference over many lines, which three hero-led pages never showed.
   */
  /*
   * ⚠️ EACH GUIDE AT THE WIDTH WHERE ITS HEADLINE BROKE DIFFERENTLY (swept 2026-10-01: fonts
   * blocked vs delivered at 28 widths). The printing guide at 412px is the live CLS of 0.233. The
   * guide headlines no longer swap (`.hero-guide` in site.css); these are the widths that prove it.
   * A new guide joins with the width its own headline breaks at, if any.
   */
  for (const [path, width] of [
    ['/guides/how-a-private-label-order-works', 368],
    ['/guides/minimum-order-and-samples', 400],
    ['/guides/garment-printing-methods', 412],
    ['/guides/3d-garment-reference', 424],
    ['/guides/private-label-packaging', 1280],
    ['/guides/sportswear-fabrics-and-weights', 1440],
  ] as const) {
    test(`${path} at ${width}px, where its headline used to re-wrap, stays at or under 0.02`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'the Layout Instability API is Chromium-only')
      await installObserver(page)
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
        `layout shift at ${width}px while the fonts swapped in; moved: ${(await readMoved(page)).join(', ')}`,
      ).toBeLessThanOrEqual(0.02)
    })
  }

  /*
   * ⚠️ THE LEGAL HEADLINES NEVER SWAP EITHER (owner decision 2026-10-01, `.hero-legal` in site.css),
   * found when the 150ms check below failed CI at /privacy 390px with CLS 0.0385, twice, on a run
   * after one where it passed. Both headlines keep their line COUNT in either font, but `text-wrap:
   * balance` picks a different split: "We store / nothing you / did not choose." in the stand-in,
   * "… nothing / you did not choose." in Archivo. Swept 320-480px in steps of 8: 19 widths re-broke
   * inside CI's image and 6 (440-480px) on a Mac; /terms re-broke at 344 and 352px inside the image.
   * ⚠️ THE ORDER THE TWO FONTS LAND IN DECIDES IT, so these fix the worst one. Measured inside CI's
   * image, /privacy at 390px: both fonts together scored 0.0197 (a pass by 0.0003, at 150ms or
   * 600ms), Archivo first and the serif 450ms later 0.0384, the CI failure. In between, the headline
   * is Archivo with a stand-in accent, a mix that splits differently again. At 448px every order
   * scored 0.0358. Archivo is held past the stand-in's first paint; the serif lands well after it.
   *
   * ⚠️ THE FOUR FAMILY PAGES JOINED THE SAME DAY (owner decision, `.hero-family`; the home headline
   * keeps its swap on purpose). Measured this way before the fix, identical on a Mac and inside CI's
   * image: teamwear 0.036 at 768px and 0.063 at 1280px (a word changes lines at every width from
   * 768 to 1440), casual-wear 0.028 at 368px (five lines become four). Teamwear at 416px jumped
   * on a Mac only (0.027 there, 0.001 in the image), so CI could never prove it and it is not here.
   */
  for (const [path, width] of [
    ['/privacy', 390],
    ['/privacy', 448],
    ['/terms', 344],
    ['/custom-teamwear-manufacturer', 768],
    ['/custom-teamwear-manufacturer', 1280],
    ['/private-label-casual-wear-manufacturer', 368],
  ] as const) {
    test(`${path} at ${width}px, where its headline re-broke, stays at or under 0.02 when Archivo lands before the serif`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'the Layout Instability API is Chromium-only')
      await installObserver(page)
      await page.route(FONT_FILES, async (route) => {
        const serif = /instrument-serif/.test(route.request().url())
        await new Promise((resolve) => setTimeout(resolve, serif ? 600 : 150))
        await route.continue()
      })
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)
      await page.evaluate(() => document.fonts.ready.then(() => true))
      await page.waitForTimeout(300)
      expect(
        await readCls(page),
        `layout shift at ${width}px while the fonts swapped in; moved: ${(await readMoved(page)).join(', ')}`,
      ).toBeLessThanOrEqual(0.02)
    })
  }

  for (const path of [
    ...PAGES,
    '/privacy',
    '/terms',
    '/guides',
    '/guides/garment-printing-methods',
  ]) {
    for (const width of [390, 768, 1350]) {
      test(`${path} at ${width}px stays at or under 0.02 while the fonts arrive late`, async ({
        page,
        browserName,
      }) => {
        test.skip(browserName !== 'chromium', 'the Layout Instability API is Chromium-only')
        // ⚠️ SKIPPED IN CI'S LINUX CHROME ONLY (PR #128, 2026-10-05, the owner's choice): 0.052 there,
        // under 0.02 on the Mac. Linux-only and not yet measured; the next session calibrates it.
        test.skip(
          process.platform === 'linux' && path === '/terms' && width === 390,
          "CI's Linux Chrome only (PR #128, 2026-10-05; the owner chose to skip it there for now): a Linux-only layout shift, to be measured",
        )
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
          `layout shift at ${width}px while the fonts swapped in; moved: ${(await readMoved(page)).join(', ')}`,
        ).toBeLessThanOrEqual(0.02)
      })
    }
  }

  /*
   * Polish X19 (2026-10-04): at 1920px the not-found headline set two lines in the stand-in and one
   * in Archivo, so the page jumped up 66px a moment after loading, every time (0.24 live). It keeps
   * one font from first paint now (`.hero-notfound`). The control puts the swapping face back.
   *
   * ⚠️ THE CONTROL IS AT 1439px SINCE POLISH D1 (2026-10-04). The jump needs a 1311-1312px column
   * under the 72px headline: the stand-in's line is wider than that and Archivo's is not. D1 widened
   * the 1920px column to 1472px, where both fonts fit one line and the old face no longer jumps
   * (the control failed to reproduce it), so the column the jump was measured in is now 1439px's.
   */
  for (const [width, swapping] of [
    [1920, false],
    [1439, false],
    [1350, false],
    [390, false],
    [1439, true],
  ] as const) {
    test(`the not-found page at ${width}px ${swapping ? 'WITH THE OLD SWAPPING FACE (negative control) shifts' : 'stays at or under 0.02'} while the fonts arrive late`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'the Layout Instability API is Chromium-only')
      await installObserver(page)
      if (swapping) {
        await page.addInitScript(() => {
          document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style')
            style.textContent =
              '.hero-notfound{--font-display:"Archivo Variable","Archivo","Archivo Display Fallback",system-ui,sans-serif;--font-serif:"Instrument Serif","Instrument Serif Fallback",Georgia,serif}'
            document.head.append(style)
          })
        })
      }
      await page.route(FONT_FILES, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 150))
        await route.continue()
      })
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/definitely-not-a-page')
      await page.evaluate(() => document.fonts.ready.then(() => true))
      await page.waitForTimeout(300)
      const shift = await readCls(page)
      if (swapping) expect(shift, 'the control did not reproduce the jump').toBeGreaterThan(0.02)
      else expect(shift, `moved: ${(await readMoved(page)).join(', ')}`).toBeLessThanOrEqual(0.02)
    })
  }
})

/*
 * ⚠️ POLISH D11 (2026-10-04): BODY TEXT SWAPS TO ARCHIVO WHEN IT LANDS, AND A WIDTH IN `ch` MOVED WITH
 * IT. A `ch` is the zero of whichever font draws (MDN, <length>), and the stand-in's zero is 4.6%
 * narrower than Archivo's: at 768px the home page's lede lost a line (layout shift 0.022) and its
 * fifth category card grew 34px taller when Archivo arrived. The website's body-text widths are in
 * `em` since (site.css, `--site-measure` and `p, li`). This compares every body-text box that its
 * width cap holds (lifting the cap would widen it) with the fonts blocked, so the stand-in draws,
 * and delivered, at pages and widths where those caps hold (swept on 11 pages at 390-1920px).
 *
 * ⚠️ READ ONCE THE PAGE HAS SETTLED, NOT AT `document.fonts.ready`. Under reduced motion Chromium
 * gives a `ch` box Archivo's zero a frame or two after `ready` resolves (26ms, measured), so a reading
 * taken at once compared the stand-in with itself and passed with a `ch` cap planted on the lede.
 * Each state is read after two animation frames, again until two readings agree.
 *
 * 1px of slack: Firefox rounds a zero's advance to its pixel grid, so at 15px Archivo's 60ch is
 * 516.00px there against 34.362em's 515.43px, and `max(60ch, 34.362em)` takes the wider. The jumps
 * this guards against measured 19-27px.
 */
test.describe('D11 — a body-text box held at its width cap is the same width in either font', () => {
  interface Boxes {
    capped: string[]
    widths: Record<string, number>
  }

  async function readBoxes(
    page: Page,
    path: string,
    width: number,
    fonts: 'blocked' | 'delivered',
  ) {
    await page.unroute(FONT_FILES).catch(() => undefined)
    if (fonts === 'blocked') await page.route(FONT_FILES, (route) => route.abort())
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: 900 })
    await page.goto(path)
    await Promise.race([
      page.evaluate(async () => {
        await document.fonts.load('400 17px "Archivo Variable"').catch(() => undefined)
        await document.fonts.ready
      }),
      page.waitForTimeout(3000),
    ])
    const archivoLoaded = await page.evaluate(() =>
      [...document.fonts].some(
        (face) =>
          face.family.replaceAll('"', '') === 'Archivo Variable' && face.status === 'loaded',
      ),
    )
    expect(archivoLoaded, `Archivo loaded with the fonts ${fonts}`).toBe(fonts === 'delivered')
    let previous = ''
    let boxes: Boxes = { capped: [], widths: {} }
    for (let reading = 0; reading < 10; reading++) {
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      boxes = await page.evaluate((): Boxes => {
        const seen = new Map<string, number>()
        const capped: string[] = []
        const widths: Record<string, number> = {}
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const name = `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}`
          const count = (seen.get(name) ?? 0) + 1
          seen.set(name, count)
          const style = getComputedStyle(el)
          // Body text only: its stack is the one that names the body stand-in.
          if (style.maxWidth === 'none' || !style.fontFamily.includes('Archivo Fallback')) continue
          const box = el.getBoundingClientRect().width
          if (box === 0) continue
          const key = `${name} #${count}`
          widths[key] = box
          const inline = el.style.maxWidth
          el.style.maxWidth = 'none'
          const free = el.getBoundingClientRect().width
          el.style.maxWidth = inline
          if (free > box + 0.5) capped.push(key)
        }
        return { capped, widths }
      })
      const now = JSON.stringify(boxes.widths)
      if (now === previous) return boxes
      previous = now
    }
    throw new Error(`${path} at ${width}px with the fonts ${fonts} never settled`)
  }

  const moved = (delivered: Boxes, blocked: Boxes) =>
    [...new Set([...delivered.capped, ...blocked.capped])]
      .filter((key) => Math.abs((delivered.widths[key] ?? -1) - (blocked.widths[key] ?? -1)) > 1)
      .map(
        (key) =>
          `${key}: ${blocked.widths[key]?.toFixed(1)}px in the stand-in, ${delivered.widths[key]?.toFixed(1)}px in Archivo`,
      )

  const held = (delivered: Boxes, blocked: Boxes) => [
    ...new Set([...delivered.capped, ...blocked.capped].map((key) => key.replace(/ #\d+$/, ''))),
  ]

  // No family card since polish D3: a ticket is not held at a width in the font (it drops the
  // `li` cap, site.css), so a font's arrival has nothing of it to move.
  for (const [path, width, mustHold] of [
    // The order steps' words (polish D4): capped in a card the column's width at 768px, and in a
    // card the right half's width at 1440px (at 1024px that half leaves them under the cap).
    ['/', 768, ['p.site-lede', 'p.order-step__body', 'p.footer-derisk']],
    ['/', 1440, ['p.order-step__body']],
    ['/contact', 1440, ['form.inquiry-form', 'p.contact-block__note']],
    ['/guides/garment-printing-methods', 1280, ['p']],
    // 1440, not 1024, since polish X4: from 900px the text is three fifths of the page beside
    // "On this page", and at 1024px that column (514px) is narrower than the cap (535px).
    ['/privacy', 1440, ['p']],
  ] as const) {
    test(`${path} at ${width}px`, async ({ page, browserName }) => {
      // ⚠️ SKIPPED IN CI'S LINUX CHROME ONLY (PR #128, 2026-10-05, the owner's choice). That Chrome rounds
      // each letter to whole pixels: Archivo's zero (0.5727em, 9.74px here) becomes 10px, so 60ch is
      // 600.0px against 34.362em's 584.1px, and the box is 16px wider once Archivo lands. The Mac
      // measures 584.1px in both. A cap that holds under whole-pixel rounding is the next session's.
      test.skip(
        browserName === 'chromium' &&
          process.platform === 'linux' &&
          ['/ 768', '/ 1440', '/contact 1440'].includes(`${path} ${width}`),
        "CI's Linux Chrome only (PR #128, 2026-10-05; the owner chose to skip it there for now): whole-pixel letters make Archivo's 60ch 600px",
      )
      const delivered = await readBoxes(page, path, width, 'delivered')
      const blocked = await readBoxes(page, path, width, 'blocked')
      // Not vacuous: the boxes this page is here for are held at their caps.
      expect(held(delivered, blocked)).toEqual(expect.arrayContaining([...mustHold]))
      expect(moved(delivered, blocked)).toEqual([])
    })
  }

  test('the comparison sees a `ch` cap planted on the lede (negative control)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = 'html body .site-lede{max-width:55ch}'
        document.head.append(style)
      })
    })
    const delivered = await readBoxes(page, '/', 768, 'delivered')
    const blocked = await readBoxes(page, '/', 768, 'blocked')
    expect(moved(delivered, blocked).join('\n'), 'the planted cap did not move').toContain(
      'p.site-lede',
    )
  })
})
