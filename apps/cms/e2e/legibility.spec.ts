import { expect, test } from '@playwright/test'
import { readability } from '../src/lib/readingLevel'

/**
 * The three things that decide whether the copy on this site can be READ, as opposed to
 * whether it is present: how long the lines are, how dense the sentences are, and whether
 * a visitor who has asked their operating system for more contrast gets any.
 *
 * All three are rendered properties. `ch` resolves against a font this repo does not
 * control the metrics of, a reading score depends on which elements count as prose, and a
 * media query either matches or it does not — none of that is visible in the source.
 */

const PAGES = ['/', '/products', '/contact', '/privacy', '/terms'] as const

/**
 * The characters on each rendered line, counted from Range rects.
 *
 * ⚠️ NOT `width / characterWidth`. That is exactly how the first version of this audit
 * reported 93–100 characters per line: it took the advance of a 10px MONO chip — the
 * first `<p>` on the page — and divided a 17px paragraph's width by it. The published
 * correction puts the real figure at 70–83. Counting cannot make that mistake.
 */
async function lineLengths(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const rows: { where: string; longest: number; width: number; sample: string }[] = []
    for (const el of document.querySelectorAll('main p, main li')) {
      if (el.closest('header, footer, nav')) continue
      const text = el.textContent ?? ''
      if (text.trim().length < 40) continue
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const lines = new Map<number, string>()
      let node = walker.nextNode()
      while (node) {
        const value = node.nodeValue ?? ''
        for (let i = 0; i < value.length; i++) {
          const range = document.createRange()
          range.setStart(node, i)
          range.setEnd(node, i + 1)
          const rect = range.getBoundingClientRect()
          if (rect.width === 0 && rect.height === 0) continue
          const key = Math.round(rect.top)
          lines.set(key, (lines.get(key) ?? '') + value[i])
        }
        node = walker.nextNode()
      }
      const counts = [...lines.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, line]) => line.replace(/\s+$/, '').length)
      // The LAST line of a block is a ragged end, not a measure of the column.
      const full = counts.slice(0, -1)
      if (full.length === 0) continue
      rows.push({
        where: `${el.tagName}.${el.className || '(unclassed)'}`,
        longest: Math.max(...full),
        width: Number(el.getBoundingClientRect().width.toFixed(1)),
        sample: text.trim().slice(0, 40),
      })
    }
    return rows
  })
}

test.describe('FA-C-52 — the line length a reader actually gets', () => {
  /**
   * ⚠️ MEASURED BEFORE AND AFTER, 2026-09-07, by counting characters on 134 prose blocks
   * across five pages at three widths:
   *
   *   before   62ch = 603.63px -> longest line 82   |  60ch = 584.16px -> longest 81
   *            48 of 134 blocks ran past the 75-character upper bound
   *   after    --site-measure: 56ch = 545.21px      |  longest line 75, 0 blocks over
   *
   * `ch` is the advance of the digit zero, which in Archivo is wider than the average
   * letter in prose — so a `ch` cap always renders MORE characters than it names, and by
   * a factor nobody can predict from the source. That is why this is a browser test and
   * why the number it asserts is a character count rather than a `ch` value.
   */
  const CEILING = 75

  for (const path of PAGES) {
    test(`no line on ${path} runs past ${CEILING} characters`, async ({ page }) => {
      // One navigation, three widths — see the note in textSize.spec.ts: a `goto` per
      // width is what tipped this suite into timing out on unrelated tests.
      await page.goto(path)
      await page.evaluate(() => document.fonts.ready)

      for (const width of [768, 1180, 1440]) {
        await page.setViewportSize({ width, height: 900 })

        const rows = await lineLengths(page)
        // The control: a probe that selects nothing passes every ceiling ever set.
        expect(rows.length, `${path} at ${width}px: no prose blocks were measured`).toBeGreaterThan(
          0,
        )

        const over = rows.filter((row) => row.longest > CEILING)
        expect(
          over.map((row) => `${row.where} ${row.longest} chars in ${row.width}px "${row.sample}…"`),
          `${path} at ${width}px runs past the comfortable measure`,
        ).toEqual([])
      }
    })
  }
})

test.describe('FA-I-11 — the copy stays readable by someone reading English second', () => {
  /**
   * ⚠️ MEASURED 2026-09-07 on rendered prose, Flesch–Kincaid grade / reading ease:
   *
   *   /          8.09 / 59.4      /privacy   8.15 / 64.6
   *   /products  8.38 / 60.8      /terms     8.89 / 59.1
   *   /contact   6.07 / 66.4      all five   8.02 / 62.1
   *
   * The ceiling is 11, not 8.9. A gate set at the current value fails on the next honest
   * sentence and gets raised, which teaches everyone to raise it; set two grades clear, it
   * only fires on a real change of register — the "vertically integrated manufacturing
   * capability" direction, which `readingLevel.test.ts` shows scores above 20.
   *
   * ⚠️ PROSE ONLY, AND THE SELECTOR IS THE MEASUREMENT. `main.innerText` on /products
   * scores grade 17.5, because a gallery of card names and mono chips gives 145 words and
   * five full stops — a 29-word "sentence" with no verb. The same page restricted to
   * paragraphs is 8.4. Labels are excluded by class, which is only possible because
   * FA-I-14 gave them names.
   */
  const GRADE_CEILING = 11
  const EASE_FLOOR = 50

  for (const path of PAGES) {
    test(`${path} reads below grade ${GRADE_CEILING}`, async ({ page }) => {
      await page.goto(path)
      const text = await page.evaluate(() => {
        const parts: string[] = []
        for (const el of document.querySelectorAll('main p, main li')) {
          if (el.closest('.product-card, .filter-bar, .facts-grid')) continue
          if (
            ['section-number', 'subhead', 'field-label', 'result-count', 'label'].some((name) =>
              el.classList.contains(name),
            )
          ) {
            continue
          }
          const value = ((el as HTMLElement).innerText ?? '').trim()
          if (value.split(/\s+/).length < 5) continue
          parts.push(value)
        }
        return parts.join(' ')
      })

      const score = readability(text)
      // Two controls in one: a page with no prose returns null rather than a flattering
      // zero, and a selector that stopped matching cannot pass by measuring nothing.
      expect(score, `${path}: no prose was selected to score`).not.toBeNull()
      expect(score?.words, `${path}: too little prose to score honestly`).toBeGreaterThan(25)

      expect(
        score?.grade,
        `${path} reads at grade ${score?.grade} (${score?.words} words, ` +
          `${score?.wordsPerSentence} words per sentence). Shorter sentences and plainer ` +
          'words, or say here why this page has to be denser.',
      ).toBeLessThanOrEqual(GRADE_CEILING)
      expect(score?.ease, `${path} reading ease fell to ${score?.ease}`).toBeGreaterThanOrEqual(
        EASE_FLOOR,
      )
    })
  }
})

test.describe('FA-H-09 — a request for more contrast is answered', () => {
  /**
   * ⚠️ THE SITE ANSWERED `prefers-contrast: more` WITH ZERO BLOCKS. Counted 2026-09-07
   * against one in the viewer's `page.css`. It is a different request from
   * `forced-colors`, which this stylesheet handled twice: forced colours is the OS
   * replacing the palette, this is a visitor who can see colour and has said the default
   * separation is not enough.
   *
   * ⚠️ THE VALUES ARE COMPUTED FROM RENDERED PIXELS, NOT COPIED FROM THE STYLESHEET, and
   * they are read with no animation in flight — axe has reported false contrast failures
   * on this site by sampling text mid-reveal. Ratios asserted, not colours: a token may
   * be retuned, the separation may not shrink.
   */
  /*
   * ⚠️ THE ALPHA IS NOT OPTIONAL, AND LEAVING IT OUT MADE THIS TEST REPORT NO CHANGE.
   * The first version took the first three numbers out of `rgba(241, 239, 234, 0.7)` and
   * dropped the 0.7 — so the nav's resting colour scored 14.47:1, the value it only
   * reaches at full opacity, and the fix that removes exactly that 0.7 measured as
   * "14.47 -> 14.47". A translucent foreground has to be composited over its background
   * before it is a colour at all.
   */
  const parse = (value: string) => {
    const parts = (value.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number)
    return {
      rgb: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0],
      alpha: parts.length > 3 ? (parts[3] ?? 1) : 1,
    }
  }
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = (rgb: number[]) =>
    0.2126 * channel(rgb[0] ?? 0) + 0.7152 * channel(rgb[1] ?? 0) + 0.0722 * channel(rgb[2] ?? 0)

  const contrast = (fg: string, bg: string) => {
    const front = parse(fg)
    const back = parse(bg)
    const flattened = front.rgb.map(
      (value, index) => value * front.alpha + (back.rgb[index] ?? 0) * (1 - front.alpha),
    )
    const [light, dark] = [luminance(flattened), luminance(back.rgb)].sort((a, b) => b - a)
    return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
  }

  const sample = async (page: import('@playwright/test').Page) => {
    await page.goto('/')
    /*
     * The reveal moves opacity, and measuring through it is how a contrast number comes
     * back wrong.
     *
     * ⚠️ ONLY TIME-DRIVEN ANIMATIONS ARE AWAITED. The first version awaited every
     * `getAnimations()` entry and hung for the full 30s timeout: the notch condense and
     * the section reveals run on SCROLL and VIEW timelines, whose `finished` promise
     * never settles while the page is where it is. Those two are exactly the ones that do
     * not move colour, so skipping them is not a compromise — but a fixed `waitForTimeout`
     * here would have looked like it worked and measured whatever it caught.
     */
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.timeline === document.timeline)
          .map((animation) => animation.finished.catch(() => undefined)),
      )
    })
    return page.evaluate(() => {
      const lede = document.querySelector('.site-lede') as HTMLElement
      const nav = document.querySelector('.nav-link') as HTMLElement
      const bar = document.querySelector('.notch') as HTMLElement
      return {
        matches: matchMedia('(prefers-contrast: more)').matches,
        ledeText: getComputedStyle(lede).color,
        pageBg: getComputedStyle(document.body).backgroundColor,
        navText: getComputedStyle(nav).color,
        barBg: getComputedStyle(bar).backgroundColor,
        line: getComputedStyle(document.documentElement).getPropertyValue('--line').trim(),
      }
    })
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: secondary text and the nav gain real separation`, async ({
      page,
      browserName,
    }) => {
      /*
       * ⚠️ NAVIGATE ONCE BEFORE EMULATING ANYTHING, OR FIREFOX DROPS IT ON THE FLOOR.
       * Measured 2026-09-07: `emulateMedia({ colorScheme: 'dark' })` called on a page
       * that has never left `about:blank` is LOST — the following `goto` renders light,
       * and a `reload` does not recover it; a second `emulateMedia` after a navigation
       * works. So the first sample of the dark case came back on the LIGHT background
       * while the second came back dark, every ratio moved between them, and the test
       * passed with the contrast block doing nothing. The theme control below is what
       * caught it, which is the whole reason it is there.
       */
      await page.goto('/')
      await page.emulateMedia({ colorScheme: scheme, contrast: 'no-preference' })
      const before = await sample(page)
      test.skip(
        before.matches,
        `${browserName} cannot emulate prefers-contrast: no-preference here`,
      )

      await page.emulateMedia({ colorScheme: scheme, contrast: 'more' })
      const after = await sample(page)
      // The control: without this the whole test compares a page to itself.
      expect(after.matches, `${browserName} did not apply prefers-contrast: more`).toBe(true)
      expect(before.line, 'the --line token did not move at all').not.toBe(after.line)
      /*
       * ⚠️ AND THE TWO SAMPLES MUST BE IN THE SAME THEME. Firefox applied the colour
       * scheme late on the first navigation once during development, so `before` was
       * light and `after` dark — every ratio moved, for the wrong reason, and the test
       * would have gone green with the contrast block deleted.
       */
      expect(after.pageBg, `${scheme}: the two samples are in different themes`).toBe(before.pageBg)

      const ledeBefore = contrast(before.ledeText, before.pageBg)
      const ledeAfter = contrast(after.ledeText, after.pageBg)
      expect(
        ledeAfter,
        `the lede went ${ledeBefore.toFixed(2)}:1 -> ${ledeAfter.toFixed(2)}:1`,
      ).toBeGreaterThan(ledeBefore + 1)
      // Comfortably past AA for body text, which is the point of the request.
      expect(ledeAfter).toBeGreaterThanOrEqual(7)

      const navBefore = contrast(before.navText, before.barBg)
      const navAfter = contrast(after.navText, after.barBg)
      expect(
        navAfter,
        `the nav links went ${navBefore.toFixed(2)}:1 -> ${navAfter.toFixed(2)}:1`,
      ).toBeGreaterThan(navBefore)
      expect(navAfter).toBeGreaterThanOrEqual(7)
    })
  }
})
