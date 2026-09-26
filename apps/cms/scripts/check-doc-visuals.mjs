#!/usr/bin/env node
/**
 * Every picture on a Markdown page is described, and every Mermaid diagram draws.
 *
 * Why: the owner asked (2026-09-26) that every human page carry pictures for 5th-grade
 * readers. A picture without alt text is invisible to a screen reader, a picture path
 * that moved is a broken box, and a Mermaid block with one typo renders on GitHub as a
 * red error. None of the existing robots look at any of the three.
 *
 *   node apps/cms/scripts/check-doc-visuals.mjs              alt text + paths + Mermaid
 *   node apps/cms/scripts/check-doc-visuals.mjs --no-render  alt text + paths only
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GENERIC_ALT = /^(image|img|picture|photo|screenshot|diagram|figure|logo)\.?$/i

/**
 * Blank out fenced AND inline code, keeping line breaks so line numbers stay true.
 * Inline code is prose about a tag, not a picture: the first run flagged "the `<img>`
 * is a grid item" in docs/SESSION-2026-08-05.md.
 */
function withoutFences(markdown) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return markdown.replace(/^```[\s\S]*?^```/gm, blank).replace(/`[^`\n]+`/g, blank)
}

export function mermaidBlocks(markdown) {
  const blocks = []
  const re = /^```mermaid\n([\s\S]*?)\n```/gm
  for (let m = re.exec(markdown); m; m = re.exec(markdown)) {
    blocks.push({ line: markdown.slice(0, m.index).split('\n').length, code: m[1] })
  }
  return blocks
}

export function findVisualProblems(markdown, file, exists = existsSync) {
  const text = withoutFences(markdown)
  const problems = []
  const lineOf = (index) => text.slice(0, index).split('\n').length
  const checkSrc = (src, index) => {
    if (/^(https?:|data:|#)/.test(src)) return
    const path = resolve(dirname(file), src.split('#')[0].split('?')[0])
    if (!exists(path)) problems.push(`${file}:${lineOf(index)} picture not found: ${src}`)
  }
  for (const m of text.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?/g)) {
    const alt = m[1].trim()
    if (!alt || GENERIC_ALT.test(alt)) {
      problems.push(
        `${file}:${lineOf(m.index)} picture needs a real description (alt text): ${m[2]}`,
      )
    }
    checkSrc(m[2], m.index)
  }
  for (const m of text.matchAll(/<img\b[^>]*>/gi)) {
    const alt = /\balt\s*=\s*"([^"]*)"/i.exec(m[0])?.[1]?.trim()
    const src = /\bsrc\s*=\s*"([^"]*)"/i.exec(m[0])?.[1]
    if (!alt || GENERIC_ALT.test(alt)) {
      problems.push(`${file}:${lineOf(m.index)} <img> needs a real alt="…" description`)
    }
    if (src) checkSrc(src, m.index)
  }
  return problems
}

async function renderAll(files) {
  const require = createRequire(import.meta.url)
  const { chromium } = require('@playwright/test')
  const mermaidJs = require.resolve('mermaid/dist/mermaid.min.js')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent('<!doctype html><body></body>')
  await page.addScriptTag({ path: mermaidJs })
  await page.evaluate(() => window.mermaid.initialize({ startOnLoad: false }))
  const problems = []
  for (const file of files) {
    for (const { line, code } of mermaidBlocks(readFileSync(file, 'utf8'))) {
      const error = await page.evaluate(async (c) => {
        try {
          await window.mermaid.parse(c)
          return null
        } catch (e) {
          return String(e?.message ?? e).split('\n')[0]
        }
      }, code)
      if (error) problems.push(`${file}:${line} Mermaid diagram will not draw: ${error}`)
    }
  }
  await browser.close()
  return problems
}

// `import.meta.filename === realpathSync(argv[1])`, the form mainModuleCheck.test.ts requires:
// a URL comparison breaks on a path with a space.
if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const files = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('docs/archive/'))
    .map((f) => join(root, f))
  const render = !process.argv.includes('--no-render')
  const problems = files.flatMap((f) => findVisualProblems(readFileSync(f, 'utf8'), f))
  if (render) problems.push(...(await renderAll(files)))
  for (const p of problems) console.log(`✗ ${p}`)
  console.log(
    problems.length
      ? `✗ ${problems.length} picture problem(s)`
      : `✓ ${files.length} files: every picture described${render ? ', every diagram draws' : ' (diagrams NOT drawn: --no-render)'}`,
  )
  process.exit(problems.length ? 1 : 0)
}
