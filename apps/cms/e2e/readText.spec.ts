import { expect, test } from './offlineMedia'

/**
 * VA-11 (visual audit, the owner's choice of 2026-10-02): every text that is READ is at least
 * 12px; only the decorative register keeps 10–11px. Before it, 34 kinds of text sat at 10 or 11px:
 * the footer's headings, links and small print, photo captions, the /products filter chips, card
 * cues, fact labels and more (docs/DESIGN.md, "Every text that is read is 12px").
 *
 * This walks every visible piece of text on the pages below, at a phone and a desktop width, and
 * lists whatever is under 12px and not decorative. What would have to break for it to fail: a rule
 * for text people read put back on `--text-mono` (11px) or `--text-mono-sm` (10px), or a new
 * component written at those sizes. apps/viewer/e2e/readText.spec.ts asks the garment page.
 *
 * DECORATIVE, by the owner's list: bracket labels (`.label` and its two parts on the home page, and
 * the bracketed `.field-label`s on /contact), section numbers and the "[ Photo to come ]"
 * placeholder. The order timeline's 11px step numbers were on the list until polish D4 (2026-10-05)
 * made each step a card with its number at the section-number size. Text nobody sees (hidden, transparent or screen-reader-only) is
 * not asked about.
 */
const PAGES = [
  '/',
  '/products',
  '/contact',
  '/guides',
  '/guides/how-a-private-label-order-works',
  // The site's first table, its column headers in 12px mono (polish X22).
  '/guides/garment-printing-methods',
  '/custom-teamwear-manufacturer',
  '/privacy',
  '/terms',
  '/this-page-does-not-exist',
]

const DECORATIVE = [
  '.label',
  '.label__dot',
  '.label__tail',
  '.section-number',
  '.contact-block .field-label',
  '.product-card__placeholder',
].join(', ')

for (const width of [390, 1440]) {
  test(`no text that is read is under 12px at ${width}px (VA-11)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const small: string[] = []
    let measured = 0
    for (const path of PAGES) {
      await page.goto(path)
      const found = await page.evaluate((decorative) => {
        const out: string[] = []
        let count = 0
        for (const element of document.querySelectorAll<HTMLElement>('body *')) {
          if (element.closest('script, style, noscript, .visually-hidden, .sr-only')) continue
          const own = [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? '')
            .join('')
            .trim()
          if (own.length === 0) continue
          const style = getComputedStyle(element)
          if (style.display === 'none' || style.visibility === 'hidden') continue
          if (Number(style.opacity) === 0) continue
          const box = element.getBoundingClientRect()
          if (box.width === 0 || box.height === 0) continue
          count++
          const size = Number.parseFloat(style.fontSize)
          if (size >= 12 || element.matches(decorative)) continue
          const classes = [...element.classList].join('.')
          out.push(
            `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''} ${size}px "${own.slice(0, 40)}"`,
          )
        }
        return { out, count }
      }, DECORATIVE)
      measured += found.count
      small.push(...found.out.map((entry) => `${path}: ${entry}`))
    }
    // The control: a walk that found no text at all would pass for the wrong reason.
    expect(measured, 'the walk found almost no text').toBeGreaterThan(200)
    expect(small, 'text that is read, set under 12px').toEqual([])
  })
}
