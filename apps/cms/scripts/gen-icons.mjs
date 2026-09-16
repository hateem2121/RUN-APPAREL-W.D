/**
 * Generate `public/favicon.ico` and `public/apple-touch-icon.png` from `public/icon.svg`.
 *
 * WHY THIS EXISTS. Measured live on 2026-09-16, before these files existed:
 *
 *     GET wear-run.help/favicon.ico          -> 404, text/html, 17,772 bytes
 *     GET wear-run.help/apple-touch-icon.png -> 404, text/html, 17,781 bytes
 *
 * Seventeen kilobytes of branded error page in answer to a request for an icon. Every
 * browser asks for `/favicon.ico` unbidden, whatever the document declares, so the only
 * cure is a real file that Next serves from `public/`. The viewer hit the identical fault
 * and fixed it on 2026-09-05 (`apps/viewer/scripts/gen-favicon.mjs`); the marketing site
 * never got the same treatment, and its `/icon.svg` was additionally unparseable, so the
 * site had no working tab icon at all.
 *
 * WHY sharp HERE AND PLAYWRIGHT IN gen-og-image.mjs. That script renders TEXT, and SVG
 * text comes out in whatever face the rasteriser can find, so it needs a real browser with
 * the woff2 embedded. This mark is pure polygons and bezier paths with no text, so a
 * rasteriser cannot substitute anything. sharp is the smaller tool for the smaller job.
 *
 * ⚠️ DO NOT PASS A `density`. sharp scales an SVG by density/72, and this mark's viewBox is
 * 8671 units, so `gen-favicon.mjs`'s density of 384 asks for a 46,245 pixel wide raster and
 * sharp refuses outright with "Input image exceeds pixel limit". The default renders it at
 * its natural size, which downsamples cleanly.
 *
 * ⚠️ NOT WIRED INTO ANY BUILD, deliberately, exactly as gen-og-image.mjs is not: the
 * outputs are committed and change only when the brand does. Run it by hand:
 *
 *     node apps/cms/scripts/gen-icons.mjs --force
 *
 * ⚠️ REFUSES TO OVERWRITE without `--force`, the same guard gen-favicon.mjs carries. These
 * are committed binaries; regenerating them silently on someone else's branch is how a
 * binary asset changes without anybody deciding to change it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { icoFromPng } from '../../viewer/scripts/ico.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CMS = join(HERE, '..')
const PUBLIC_DIR = join(CMS, 'public')
const REPO = join(CMS, '..', '..')

const force = process.argv.includes('--force')

/** sharp is the pipeline's dependency and deliberately not the CMS's: it is a native
 *  module, and this Worker cannot load one. Resolved from where it actually lives. */
const require = createRequire(join(REPO, 'tools', 'asset-pipeline', 'package.json'))
let sharp
try {
  sharp = require('sharp')
} catch (error) {
  console.error(
    'gen-icons: sharp could not be resolved from tools/asset-pipeline.\n' +
      '  Run `npx --yes pnpm@10.34.5 install --frozen-lockfile` first.\n' +
      `  ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}

/**
 * The committed SVG is the source of truth, so the three files cannot drift apart.
 *
 * ⚠️ The media query inside it is stripped for the raster outputs, and that is correct
 * rather than lazy: a PNG and an ICO hold pixels, not rules, so they cannot follow a
 * theme. They are rendered in the ink colour, which is the light-tab case; the SVG keeps
 * the query and is what a modern browser actually uses.
 */
function markup() {
  const svg = readFileSync(join(PUBLIC_DIR, 'icon.svg'), 'utf8')
  if (svg.includes('<!--') && /<!--[\s\S]*?--[\s\S]*?-->/.test(svg.replace(/-->/g, ''))) {
    throw new Error('gen-icons: icon.svg comment contains a double hyphen, which is invalid XML')
  }
  return svg.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/, '')
}

async function main() {
  const svg = markup()
  const render = (size) =>
    sharp(Buffer.from(svg, 'utf8'))
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer()

  const targets = [
    { name: 'favicon.ico', build: async () => icoFromPng(await render(32), 32) },
    { name: 'apple-touch-icon.png', build: () => render(180) },
  ]

  for (const { name, build } of targets) {
    const target = join(PUBLIC_DIR, name)
    if (existsSync(target) && !force) {
      console.log(`gen-icons: ${name} exists, leaving it (pass --force to regenerate)`)
      continue
    }
    const bytes = await build()
    writeFileSync(target, bytes)
    console.log(`gen-icons: wrote public/${name} (${bytes.length} bytes)`)
  }
}

main().catch((error) => {
  console.error(`gen-icons: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
