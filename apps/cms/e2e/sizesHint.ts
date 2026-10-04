import type { Page } from '@playwright/test'

/**
 * The width a `sizes` value names at the current window, worked out by the browser: the first entry
 * whose condition `matchMedia` accepts, its length drawn on a probe, so `vw` and `calc()` resolve
 * exactly as they do for a picture (polish D1, 2026-10-04). `NaN` when no entry applies.
 *
 * A browser picks a picture's file from this hint alone, before it has laid the page out, so a
 * hint smaller than the box hands a sharp screen a file it has to stretch. Comparing the hint with
 * the box the browser really draws is the only check that catches a layout change the hint did not
 * follow; reading the string back proves only that it is the string.
 */
export async function hintedWidth(page: Page, sizes: string): Promise<number> {
  return page.evaluate((value) => {
    const entries: string[] = []
    let depth = 0
    let start = 0
    for (let at = 0; at < value.length; at++) {
      if (value[at] === '(') depth++
      else if (value[at] === ')') depth--
      else if (value[at] === ',' && depth === 0) {
        entries.push(value.slice(start, at))
        start = at + 1
      }
    }
    entries.push(value.slice(start))
    for (const entry of entries.map((part) => part.trim())) {
      const split = entry.match(/^(\(.*\))\s+(\S.*)$/)
      if (split?.[1] && !matchMedia(split[1]).matches) continue
      const probe = document.createElement('div')
      probe.style.cssText = `position: absolute; visibility: hidden; width: ${split?.[2] ?? entry}`
      document.body.append(probe)
      const width = probe.getBoundingClientRect().width
      probe.remove()
      return width
    }
    return Number.NaN
  }, sizes)
}
