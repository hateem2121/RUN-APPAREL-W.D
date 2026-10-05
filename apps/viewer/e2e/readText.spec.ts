import { expect, test } from '@playwright/test'

/**
 * VA-11 (visual audit, the owner's choice of 2026-10-02): every text that is READ is at least
 * 12px; only the decorative register keeps 10–11px. On a garment page the camera buttons, the HD
 * IMAGE button, the spec notes on the stage, the product line above it on a phone, the download
 * count and the footer's words all sat at 10 or 11px (docs/DESIGN.md, "Every text that is read is
 * 12px").
 *
 * This walks every visible piece of text on a garment page, at a phone and a desktop width, and
 * lists whatever is under 12px and not decorative. What would have to break for it to fail: a rule
 * for text people read put back on `--text-mono` (11px) or `--text-mono-sm` (10px), or a new
 * component written at those sizes. apps/cms/e2e/readText.spec.ts asks the website's pages.
 *
 * DECORATIVE, by the owner's list: bracket labels (`.label`) and section numbers. The spec list's
 * `[ Fabric ]` terms were too, until polish D10 (2026-10-04) made the garment's facts four groups
 * whose headings are read at 12px, so they are asked about like any other text. Text nobody sees
 * is not asked about. The walk starts as soon as the headline shows, so the download count, which
 * is on screen only while the model arrives, is read whenever it is still there.
 */
// `.label > [translate="no"]`: the garment code inside "[ ATHLETIC / N001 ]", in a span of its
// own since polish X27 (2026-10-04) so a browser's Translate leaves it alone. Part of the label.
const DECORATIVE = ['.label', '.label > [translate="no"]', '.section-number'].join(', ')

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`no text that is read is under 12px at ${viewport.width}px (VA-11)`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
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
    // The control: a walk that found no text at all would pass for the wrong reason.
    expect(found.count, 'the walk found almost no text').toBeGreaterThan(40)
    expect(found.out, 'text that is read, set under 12px').toEqual([])
  })
}
