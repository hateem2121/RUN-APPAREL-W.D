#!/usr/bin/env node
/**
 * contact-sheet.mjs — a screenshot of every site page, at every audited width, in both
 * themes (DS-12).
 *
 * WHY THIS EXISTS. The original 2026-09-09/10 whole-site audit reviewed contact sheets
 * swept by hand (`scratchpad/shots-before-after.mjs`, per the tracker — a one-off,
 * uncommitted script, confirmed absent from this repo: no durable version of it, or of
 * any contact-sheet sweep, exists anywhere in the repo-root `scripts/` or either app's
 * own `scripts/` directory). This is that missing durable version.
 *
 * WHAT THIS DOES NOT DO. It does not judge composition, spacing or hierarchy — that
 * stays a human looking at the pictures, the same way the original audit worked. This
 * only proves the sweep runs and produces the expected number of pictures.
 *
 * WHY IN "apps/cms/scripts/", NOT THE REPO-ROOT "scripts/" — same reason as
 * "content-density-report.mjs" (DS-11) and the existing "apps/cms/scripts/calibrate-fallback.mjs":
 * this needs "@playwright/test", which is a devDependency of "apps/cms" and "apps/viewer"
 * only, never hoisted to the repo root.
 *
 * Usage:
 *   node apps/cms/scripts/contact-sheet.mjs [--base-url https://wear-run.help] [--out DIR]
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const BASE_URL = (() => {
  const flagIndex = process.argv.indexOf('--base-url')
  return (
    (flagIndex >= 0 ? process.argv[flagIndex + 1] : 'https://wear-run.help') ??
    'https://wear-run.help'
  )
})().replace(/\/+$/, '')

const OUT_DIR = (() => {
  const flagIndex = process.argv.indexOf('--out')
  return (
    (flagIndex >= 0 ? process.argv[flagIndex + 1] : join('output', 'contact-sheet')) ??
    join('output', 'contact-sheet')
  )
})()

export const PAGES = ['/', '/products', '/contact']
export const WIDTHS = [390, 768, 1440]
export const THEMES = ['light', 'dark']

/** Every combination this sweep shoots — exported so the liveness test can assert the
 * exact expected file count without hardcoding `3 * 3 * 2` in two places. */
export function combinations() {
  const out = []
  for (const path of PAGES) {
    for (const width of WIDTHS) {
      for (const theme of THEMES) out.push({ path, width, theme })
    }
  }
  return out
}

function fileNameFor({ path, width, theme }) {
  const slug = path === '/' ? 'home' : path.replace(/^\//, '')
  return `${slug}-${width}-${theme}.png`
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`[contact-sheet] ${BASE_URL} -> ${OUT_DIR}`)
  console.log(
    '[contact-sheet] LIVENESS ONLY — this does not judge composition quality; a person ' +
      'reviews the pictures, the same way the original 2026-09-09/10 audit did.',
  )

  const browser = await chromium.launch()
  try {
    const written = []
    for (const combo of combinations()) {
      const page = await browser.newPage({
        viewport: { width: combo.width, height: 900 },
        colorScheme: combo.theme,
      })
      await page.goto(`${BASE_URL}${combo.path}`)
      await page.evaluate(() => document.fonts.ready)
      const filePath = join(OUT_DIR, fileNameFor(combo))
      await page.screenshot({ path: filePath, fullPage: true })
      written.push(filePath)
      await page.close()
      console.log(`[contact-sheet] wrote ${filePath}`)
    }
    console.log(`[contact-sheet] done — ${written.length} screenshot(s) in ${OUT_DIR}`)
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
