#!/usr/bin/env node
/**
 * Render a private document's PDF into the page pictures and manifest the Worker serves.
 *
 *   node scripts/document-pages.mjs --doc catalogue \
 *     --pdf ~/Backups/wear-run-pdfs-2026-08-31/RUN-Apparel-Catalogue.pdf \
 *     --md5 e8698731ac2348595c3268dfd6d466c6 --out ~/document-pages/catalogue
 *
 * WHY. The catalogue PDF holds 1,243 images, 543 with soft masks, and is not linearized;
 * a browser's PDF viewer decodes and blends them on the visitor's device as each page
 * scrolls in (Ghostscript: 27.2 s to draw every page on the owner's Mac, 2026-09-11).
 * Rendering once here moves that work off the phone, as Google Drive's preview does.
 *
 * WHAT IT WRITES, all under --out, which must be OUTSIDE this repository (it is public):
 *   <version>/<part>-<width>.webp   every part at 800, 1600 and 2400 px, WebP quality 80
 *   manifest.json                   checked with the Worker's own validateManifest
 *   contact-sheet.jpg               every page, small; split pages carry a red centre line
 *
 * ⚠️ --md5 IS THE R2 OBJECT'S ETAG. Pictures made from any file other than the one the
 * Download button serves would show pages the download does not contain, so a mismatch
 * stops the run.
 * ⚠️ `sharp` IS NOT A ROOT DEPENDENCY: the root package.json names it only under
 * `pnpm.overrides`, and `tools/asset-pipeline` declares it. It is loaded from there,
 * inside `main()`, so tests import the pure functions without it.
 * ⚠️ Ghostscript must be on PATH (10.08.0 on the owner's Mac, 2026-09-11). CI runners do
 * not have it, which is why rendering is verified locally rather than in CI.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { DOCUMENTS } from '../infra/apex-404/documents.js'
import {
  MANIFEST_SCHEMA,
  WIDTHS,
  expectedPartIds,
  pictureFileName,
  validateManifest,
} from '../infra/apex-404/manifest.js'

export const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DPI = 120
export const WEBP_QUALITY = 80

/**
 * @param {string} date YYYYMMDD
 * @param {string} md5 the PDF's MD5, lowercase hex
 * @returns {string}
 */
export function versionFor(date, md5) {
  if (!/^\d{8}$/.test(date)) throw new Error(`--date must be YYYYMMDD, got "${date}"`)
  if (!/^[0-9a-f]{32}$/.test(md5)) throw new Error('the PDF MD5 must be 32 lowercase hex digits')
  return `${date}-${md5.slice(0, 8)}`
}

/**
 * The --whole list: pages to keep as one picture instead of two halves, for a spread
 * whose artwork crosses the middle (found on the contact sheet).
 *
 * @param {string | undefined} text
 * @returns {Set<number>}
 */
export function parsePageList(text) {
  if (!text) return new Set()
  const items = text.split(',').map((item) => item.trim())
  for (const item of items) {
    if (!/^[1-9]\d{0,2}$/.test(item)) {
      throw new Error(`--whole expects page numbers like 5,17, got "${item}"`)
    }
  }
  return new Set(items.map(Number))
}

/**
 * @param {{ split: boolean, number: number, width: number, height: number }} page
 * @returns {{ id: string, left: number, top: number, width: number, height: number }[]}
 */
export function partsForPage({ split, number, width, height }) {
  const widest = WIDTHS[WIDTHS.length - 1]
  const ids = expectedPartIds(number, split ? 2 : 1)
  if (split && width % 2 !== 0) {
    throw new Error(`page ${number} is ${width}px wide, which cannot split into two equal halves`)
  }
  const partWidth = split ? width / 2 : width
  if (partWidth < widest) {
    throw new Error(`page ${number} parts are ${partWidth}px, narrower than ${widest}px`)
  }
  return split
    ? [
        { id: ids[0], left: 0, top: 0, width: partWidth, height },
        { id: ids[1], left: partWidth, top: 0, width: partWidth, height },
      ]
    : [{ id: ids[0], left: 0, top: 0, width, height }]
}

/**
 * @param {{
 *   doc: import('../infra/apex-404/documents.js').DocumentConfig,
 *   version: string,
 *   pdf: { bytes: number, md5: string },
 *   pages: import('../infra/apex-404/manifest.js').ManifestPage[],
 * }} input
 * @returns {import('../infra/apex-404/manifest.js').Manifest}
 */
export function buildManifest({ doc, version, pdf, pages }) {
  return {
    schema: MANIFEST_SCHEMA,
    document: doc.id,
    version,
    widths: [...WIDTHS],
    pdf: { key: doc.pdfKey, bytes: pdf.bytes, md5: pdf.md5 },
    pages,
  }
}

/** @param {string} filePath */
export function postScriptString(filePath) {
  return `(${filePath.replace(/[\\()]/g, (c) => `\\${c}`)})`
}

/** @param {string} pdf */
export function pageCountArgs(pdf) {
  return [
    '-q',
    '-dNODISPLAY',
    '-dNOSAFER',
    '-c',
    `${postScriptString(pdf)} (r) file runpdfbegin pdfpagecount = quit`,
  ]
}

/**
 * @param {string} pdf
 * @param {string} outPattern e.g. `/tmp/x/page-%03d.png`
 */
export function renderArgs(pdf, outPattern) {
  return [
    '-q',
    '-dSAFER',
    '-dBATCH',
    '-dNOPAUSE',
    '-sDEVICE=png16m',
    `-r${DPI}`,
    '-dTextAlphaBits=4',
    '-dGraphicsAlphaBits=4',
    `-sOutputFile=${outPattern}`,
    pdf,
  ]
}

/**
 * @param {string} dir
 * @param {string} root
 */
export function isInside(dir, root) {
  const target = resolve(dir)
  const base = resolve(root)
  return target === base || target.startsWith(`${base}${sep}`)
}

/** @param {string} file @returns {Promise<string>} */
function md5File(file) {
  return new Promise((done, fail) => {
    const hash = createHash('md5')
    createReadStream(file)
      .on('error', fail)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => done(hash.digest('hex')))
  })
}

/**
 * Every page at 480px, four across; a red line down the middle of each split spread
 * shows where the halves were cut, so a spread whose artwork crosses it can be re-run
 * with --whole.
 *
 * @param {any} sharp
 * @param {{ png: string, number: number, split: boolean, width: number, height: number }[]} pages
 * @param {string} file
 */
async function writeContactSheet(sharp, pages, file) {
  const thumb = 480
  const gap = 8
  const columns = 4
  const tiles = []
  for (const page of pages) {
    const height = Math.round((page.height / page.width) * thumb)
    const line = page.split
      ? `<line x1="${thumb / 2}" y1="0" x2="${thumb / 2}" y2="${height}" stroke="#ff0000" stroke-width="2"/>`
      : ''
    const label = `<rect width="44" height="22" fill="#000000"/><text x="6" y="16" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#ffffff">${page.number}</text>`
    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${thumb}" height="${height}">${line}${label}</svg>`,
    )
    const input = await sharp(page.png)
      .resize({ width: thumb })
      .composite([{ input: overlay, top: 0, left: 0 }])
      .png()
      .toBuffer()
    tiles.push({ input, height })
  }
  const rowHeight = Math.max(...tiles.map((tile) => tile.height)) + gap
  await sharp({
    create: {
      width: columns * (thumb + gap) + gap,
      height: Math.ceil(tiles.length / columns) * rowHeight + gap,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite(
      tiles.map((tile, i) => ({
        input: tile.input,
        left: gap + (i % columns) * (thumb + gap),
        top: gap + Math.floor(i / columns) * rowHeight,
      })),
    )
    .jpeg({ quality: 80 })
    .toFile(file)
}

async function main() {
  const { values } = parseArgs({
    options: {
      doc: { type: 'string' },
      pdf: { type: 'string' },
      md5: { type: 'string' },
      out: { type: 'string' },
      date: { type: 'string' },
      whole: { type: 'string' },
    },
  })
  const id = values.doc ?? ''
  if (!Object.hasOwn(DOCUMENTS, id) || !values.pdf || !values.md5 || !values.out) {
    console.error(
      'Usage: node scripts/document-pages.mjs --doc catalogue|profile --pdf <file> ' +
        '--md5 <R2 etag> --out <dir outside the repo> [--date YYYYMMDD] [--whole 5,17]',
    )
    process.exit(2)
  }
  const doc = DOCUMENTS[/** @type {'catalogue' | 'profile'} */ (id)]
  const out = resolve(values.out)
  if (isInside(out, REPO_ROOT)) {
    throw new Error(
      `--out ${out} is inside the repository, which is public. Write the pictures elsewhere.`,
    )
  }

  const md5 = await md5File(values.pdf)
  if (md5 !== values.md5) {
    throw new Error(`${values.pdf} has MD5 ${md5}, not the R2 object's ${values.md5}.`)
  }
  const bytes = (await stat(values.pdf)).size
  const date = values.date ?? new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const version = versionFor(date, md5)
  const whole = parsePageList(values.whole)

  const sharp = createRequire(join(REPO_ROOT, 'tools', 'asset-pipeline', 'package.json'))('sharp')

  const count = Number(execFileSync('gs', pageCountArgs(values.pdf), { encoding: 'utf8' }).trim())
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Ghostscript could not count the pages of ${values.pdf}`)
  }
  for (const number of whole) {
    if (number > count) throw new Error(`--whole names page ${number}, but the PDF has ${count}`)
  }

  const scratch = await mkdtemp(join(tmpdir(), 'document-pages-'))
  try {
    console.log(`[document-pages] rendering ${count} pages at ${DPI} dpi`)
    execFileSync('gs', renderArgs(values.pdf, join(scratch, 'page-%03d.png')), { stdio: 'inherit' })
    const rendered = (await readdir(scratch)).filter((f) => /^page-\d{3}\.png$/.test(f)).sort()
    if (rendered.length !== count) {
      throw new Error(`Ghostscript wrote ${rendered.length} pages, expected ${count}`)
    }

    const pictures = join(out, version)
    await mkdir(pictures, { recursive: true })
    const pages = []
    const sheet = []
    let totalBytes = 0
    for (const [index, file] of rendered.entries()) {
      const number = index + 1
      const png = join(scratch, file)
      const { width, height } = await sharp(png).metadata()
      const split = doc.id === 'catalogue' && !whole.has(number)
      const parts = partsForPage({ split, number, width, height })
      for (const part of parts) {
        const cut = await sharp(png)
          .extract({ left: part.left, top: part.top, width: part.width, height: part.height })
          .png()
          .toBuffer()
        for (const target of WIDTHS) {
          const info = await sharp(cut)
            .resize({ width: target })
            .webp({ quality: WEBP_QUALITY })
            .toFile(join(pictures, pictureFileName(part.id, target)))
          totalBytes += info.size
        }
      }
      pages.push({
        number,
        parts: parts.map((p) => ({ id: p.id, width: p.width, height: p.height })),
      })
      sheet.push({ png, number, split, width, height })
    }

    const manifest = buildManifest({ doc, version, pdf: { bytes, md5 }, pages })
    const check = validateManifest(manifest, doc)
    if (!check.ok) throw new Error(`the manifest this run built is invalid: ${check.reason}`)
    await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    await writeContactSheet(sharp, sheet, join(out, 'contact-sheet.jpg'))

    const parts = pages.reduce((sum, page) => sum + page.parts.length, 0)
    console.log(
      `[document-pages] ${doc.id} ${version}: ${count} pages, ${parts} parts, ` +
        `${parts * WIDTHS.length} pictures, ${(totalBytes / 1e6).toFixed(1)} MB`,
    )
    console.log(`[document-pages] wrote ${pictures}, manifest.json and contact-sheet.jpg in ${out}`)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
