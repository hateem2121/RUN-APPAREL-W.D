/**
 * Extract file-path citations from Markdown prose, and decide whether they resolve.
 *
 * WHY THIS IS A SHARED MODULE. `claudeMd.test.ts` grew this extractor to guard the
 * CLAUDE.md files after three broken citations were found at once on 2026-08-12. The
 * same rot is in the rest of the documentation — README's index, the RUNBOOK someone
 * opens during an outage — and a second copy of the extractor would be a second thing
 * to fix when the rules change. One implementation, two callers.
 *
 * The anchor list is what keeps this free of false positives: without it,
 * `alphaMode: BLEND`, `TEXCOORD_0`, `/api/public/viewer/n001/wine` and
 * `media.wear-run.help` all look like paths.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Top-level directories a citation may start with. `output/` is gitignored build output. */
export const ANCHORS = new Set([
  'apps',
  'packages',
  'tools',
  'scripts',
  'docs',
  'raw',
  '.claude',
  '.github',
  'patches',
])

/**
 * Extensions tried when a citation has none.
 *
 * `docs/CLOUDFLARE-SETUP.md` cites `apps/cms/src/migrations/20260720_185735_initial`,
 * which is the migration's NAME — Payload writes it as a `.ts` and a `.json` pair, and
 * naming one of them would be picking a half arbitrarily. Extension-less citation of a
 * real thing is correct here, so the resolver accommodates it rather than the document
 * accommodating the resolver.
 */
const TRY_EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.json', '.md']

/**
 * Inline-backtick spans that look like repository paths, with fenced code blocks
 * removed first so command examples are not scanned.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function citedPaths(markdown) {
  const prose = markdown.replace(/```[\s\S]*?```/g, '')
  const paths = new Set()

  for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1]
    if (!token) continue
    if (!token.includes('/')) continue
    if (/[\s*<>()?=,]/.test(token)) continue
    if (token.startsWith('/') || token.startsWith('~') || token.startsWith('#')) continue
    if (token.includes('node_modules')) continue

    // Strip a trailing `:42` line reference. This repo cites `file.ts:219` and
    // `tokens.css:2` routinely — the harness even renders them as clickable links —
    // so treating the line number as part of the filename reported four false
    // positives the first time this ran over docs/.
    const clean = token.replace(/:\d+(?::\d+)?$/, '').replace(/\/+$/, '')

    const [anchor] = clean.split('/')
    if (!anchor || !ANCHORS.has(anchor)) continue
    paths.add(clean)
  }
  return [...paths]
}

/**
 * Does this citation point at something that exists?
 *
 * @param {string} root
 * @param {string} cited
 * @returns {boolean}
 */
export function resolves(root, cited) {
  return TRY_EXTENSIONS.some((extension) => existsSync(join(root, cited + extension)))
}
