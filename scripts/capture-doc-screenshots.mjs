#!/usr/bin/env node
/**
 * Re-take the README and guide screenshots from the LIVE site, so they can be
 * refreshed whenever the site changes (the owner asked for real screenshots,
 * 2026-09-26). Every page here is public; nothing signs in.
 *
 * Run it from a package that has Playwright, e.g.:
 *   cd apps/viewer && node ../../scripts/capture-doc-screenshots.mjs
 * Pictures are always written to docs/images/ next to THIS script's repo, whatever
 * the working directory, so it can borrow another checkout's Playwright.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(join(process.cwd(), 'package.json'))
const { chromium, devices } = require('@playwright/test')
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'images')

const SHOTS = [
  {
    file: 'viewer-phone-light.png',
    url: 'https://viewer.wear-run.help/rxps/wine',
    device: 'iPhone 15',
    scheme: 'light',
  },
  {
    file: 'viewer-phone-dark.png',
    url: 'https://viewer.wear-run.help/rxps/wine',
    device: 'iPhone 15',
    scheme: 'dark',
  },
  {
    file: 'site-home-desktop.png',
    url: 'https://wear-run.help/',
    viewport: { width: 1280, height: 800 },
    scheme: 'light',
  },
  {
    file: 'cms-admin-login.png',
    url: 'https://cms.wear-run.help/admin/login',
    viewport: { width: 1280, height: 800 },
    scheme: 'light',
  },
]

const browser = await chromium.launch()
for (const s of SHOTS) {
  const context = await browser.newContext({
    // 1.5× instead of the phone's 3×: sharp on GitHub, and ~170 KB instead of ~1 MB.
    ...(s.device ? { ...devices[s.device], deviceScaleFactor: 1.5 } : { viewport: s.viewport }),
    colorScheme: s.scheme,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  await page.goto(s.url, { waitUntil: 'networkidle', timeout: 60_000 })
  // The 3D stage decodes after "networkidle"; give it time to draw the garment.
  await page.waitForTimeout(6000)
  await page.screenshot({ path: join(OUT, s.file) })
  console.log(`saved ${s.file}`)
  await context.close()
}

// The social preview: the picture GitHub shows when someone shares the repo link.
// GitHub asks for 1280×640 and at most 1 MB; it is uploaded by hand in the repo's
// settings, so re-running this only refreshes the file. It reuses the phone shot
// just taken, so the card always shows the live garment. Colours are the Paper & Ink
// tokens (packages/ui/src/tokens.css); the tagline is the brand's own.
const phone = readFileSync(join(OUT, 'viewer-phone-light.png')).toString('base64')
const card = await browser.newPage({ viewport: { width: 1280, height: 640 } })
await card.setContent(`<!doctype html>
<style>
  body { margin: 0; width: 1280px; height: 640px; overflow: hidden; background: #f1efea;
    background-image: linear-gradient(rgba(29,31,26,.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(29,31,26,.05) 1px, transparent 1px);
    background-size: 40px 40px; font-family: system-ui, -apple-system, sans-serif; color: #1d1f1a;
    display: flex; align-items: center; justify-content: space-between; padding: 0 96px; box-sizing: border-box; }
  .tag { display: inline-block; background: #cdf345; font: 600 20px ui-monospace, Menlo, monospace;
    letter-spacing: .08em; padding: 6px 12px; border-radius: 6px; }
  h1 { font-size: 104px; line-height: .95; margin: 28px 0 24px; letter-spacing: -.02em; font-weight: 900; }
  p { font-size: 34px; margin: 0 0 12px; }
  .small { font: 500 24px ui-monospace, Menlo, monospace; color: #63665b; margin-top: 36px; }
  img { height: 560px; border-radius: 36px; border: 6px solid #1d1f1a; }
</style>
<div>
  <span class="tag">[ 3D PRODUCT REFERENCE ]</span>
  <h1>RUN<br>APPAREL</h1>
  <p>See every garment in 3D.</p>
  <p>Scan the tag. Turn it. Check the print.</p>
  <div class="small">wear-run.help · The Extra Mile</div>
</div>
<img src="data:image/png;base64,${phone}" alt="">`)
await card.screenshot({ path: join(OUT, 'social-preview.png') })
console.log('saved social-preview.png')
await browser.close()
