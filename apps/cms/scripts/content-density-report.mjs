#!/usr/bin/env node
/**
 * content-density-report.mjs — words, images and interactive controls per phone screen,
 * for each site page (DS-11).
 *
 * WHY THIS EXISTS. The tracker's own DS-11 finding ("~370 words and one picture over 8.8
 * phone screens" for the home page) was computed once, by hand. This recomputes it — a
 * REPORTING script, not a pass/fail gate, because no threshold has been set by the owner.
 * It feeds the Area-18 home-page density decision and proves nothing on its own about
 * whether the density is good.
 *
 * WHY IN `apps/cms/scripts/`, NOT THE REPO-ROOT `scripts/`. This needs a real rendered
 * page — word count and image count are cheap from static HTML, but "how many phone
 * screens" needs the page's actual layout height, which only a browser produces. The
 * repo-root `scripts/` runs under bare `node` with zero npm dependencies (see
 * `contrast-rules.mjs`'s own header for that rule); `@playwright/test` is a devDependency
 * of `apps/cms` and `apps/viewer` only, never hoisted to the root. `apps/cms/scripts/
 * calibrate-fallback.mjs` already establishes this exact pattern — a standalone script,
 * not a test file, importing `@playwright/test` from where it actually resolves.
 *
 * WHY PRODUCTION, NOT THE LOCAL FIXTURE. This is a reporting tool for a real editorial
 * decision, so it reports on the page the owner would actually see. Read-only: every
 * request is a plain navigation (a GET), and Playwright-driven Chromium sets
 * `navigator.webdriver = true` per the W3C spec — this repo's own telemetry already
 * no-ops on that flag (`apps/viewer/src/lib/telemetry.ts:142`), so this cannot record a
 * fake real-visitor sample. Pass `--base-url` to point it at a local server instead.
 *
 * Usage:
 *   node apps/cms/scripts/content-density-report.mjs [--base-url https://wear-run.help]
 */
import { chromium } from '@playwright/test'

const BASE_URL = (() => {
  const flagIndex = process.argv.indexOf('--base-url')
  return (flagIndex >= 0 ? process.argv[flagIndex + 1] : 'https://wear-run.help') ?? 'https://wear-run.help'
})().replace(/\/+$/, '')

const PAGES = ['/', '/products', '/contact']

// A representative phone viewport height — the same shape of number the tracker's own
// "8.8 phone screens" used.
const PHONE_HEIGHT = 812

async function measurePage(page, path) {
  await page.goto(`${BASE_URL}${path}`)
  await page.evaluate(() => document.fonts.ready)

  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body
    const text = (main.textContent ?? '').trim()
    const words = text.length > 0 ? text.split(/\s+/).length : 0
    const images = main.querySelectorAll('img').length
    const controls = main.querySelectorAll(
      'a, button, [role="button"], input, select, textarea',
    ).length
    return {
      words,
      images,
      controls,
      scrollHeight: document.documentElement.scrollHeight,
    }
  })
}

async function main() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: PHONE_HEIGHT } })
    console.log(`[content-density-report] ${BASE_URL}, phone viewport 390x${PHONE_HEIGHT}`)
    console.log(
      '[content-density-report] REPORTING ONLY — no threshold is set; this feeds the ' +
        'Area-18 home-page density decision and proves nothing about whether it is good.',
    )
    for (const path of PAGES) {
      const m = await measurePage(page, path)
      const screens = m.scrollHeight / PHONE_HEIGHT
      console.log(
        `[content-density-report] ${path}: ${m.words} words, ${m.images} image(s), ` +
          `${m.controls} control(s), over ${screens.toFixed(1)} phone screens ` +
          `(${m.scrollHeight}px / ${PHONE_HEIGHT}px)`,
      )
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

export { measurePage }
