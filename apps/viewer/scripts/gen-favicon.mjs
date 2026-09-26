/**
 * Generate the real favicon files from the same mark `index.html` carries inline.
 *
 * WHY THIS EXISTS. `index.html` declares the icon as a `data:image/svg+xml` URI and
 * ships no file, so `/favicon.ico` — which every browser requests unbidden, whatever
 * the document declares — fell through to the SPA fallback. Measured live
 * 2026-09-05:
 *
 *     GET /favicon.ico  ->  200, content-type: text/html, 10,046 bytes
 *
 * Ten kilobytes of HTML, labelled as a web page, in answer to a request for an
 * icon. Two costs beyond the bytes: it is a soft 404 to a crawler, and a crawler
 * requesting it took the Worker's preview branch, which burns a CMS service-binding
 * fetch that can only ever fail.
 *
 * ⚠️ GENERATED, NOT HAND-DRAWN, so the three copies of this mark cannot drift.
 * `index.html`'s inline SVG stays the source of truth; this script renders it. If
 * the brand mark changes, change it there and re-run:
 *
 *     node apps/viewer/scripts/gen-favicon.mjs
 *
 * ⚠️ RUN FROM tools/asset-pipeline, WHICH IS WHERE `sharp` LIVES. It is not a
 * dependency of the viewer and must not become one: it is a native module, and the
 * viewer's build runs on Workers where it cannot load. The script resolves it from
 * the pipeline's own node_modules rather than the viewer's.
 *
 * ⚠️ REFUSES TO OVERWRITE unless `--force`, same guard as gen-env-hdr.mjs. These
 * outputs are committed; regenerating them silently on someone else's branch is how
 * a binary asset changes without anybody deciding to change it.
 *
 * ⚠️ DO NOT PASS A `density` TO sharp (IM-09, 2026-09-24). This script used to render
 * at `density: 384` to get a clean raster from the OLD placeholder's tiny 32-unit
 * viewBox. The real mark's viewBox is 8671 units (`apps/cms/public/icon.svg`), and
 * sharp scales an SVG by density/72 — 384/72 * 8671 asks for a 46,245 pixel wide
 * raster and sharp refuses outright with "Input image exceeds pixel limit". The
 * default renders it at its natural size, which downsamples cleanly; `gen-icons.mjs`
 * carries the same rule for the identical reason.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { icoFromPng } from './ico.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const VIEWER = join(HERE, '..')
const PUBLIC_DIR = join(VIEWER, 'public')
const REPO = join(VIEWER, '..', '..')

const force = process.argv.includes('--force')

/** sharp is the pipeline's dependency, deliberately not the viewer's. */
const require = createRequire(join(REPO, 'tools', 'asset-pipeline', 'package.json'))
let sharp
try {
  sharp = require('sharp')
} catch (error) {
  console.error(
    'gen-favicon: sharp could not be resolved from tools/asset-pipeline.\n' +
      '  Run `npx --yes pnpm@12.6.0 install --frozen-lockfile` first.\n' +
      `  ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}

/**
 * Pull the mark out of index.html rather than restating it, so the file and the
 * inline data URI cannot disagree about what the logo is.
 */
function markFromIndexHtml() {
  const html = readFileSync(join(VIEWER, 'index.html'), 'utf8')
  const match = /href="data:image\/svg\+xml,([^"]+)"/.exec(html)
  if (!match?.[1]) {
    throw new Error(
      'gen-favicon: no data:image/svg+xml icon found in index.html. If the icon moved ' +
        'to a file, this script has nothing to generate from and should be deleted.',
    )
  }
  return decodeURIComponent(match[1])
}

async function main() {
  const svg = markFromIndexHtml()
  // A PNG/ICO holds pixels, not rules, so it cannot follow prefers-color-scheme —
  // strip the dark-mode override before rasterising, the same way gen-icons.mjs
  // does for the identical reason, and render in the ink colour (the light-tab
  // case). The SVG output below keeps the query: it is what a modern browser
  // actually reads.
  const rasterSvg = svg.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/, '')
  mkdirSync(PUBLIC_DIR, { recursive: true })

  const targets = [
    { name: 'favicon.ico', build: async () => icoFromPng(await render(32)) },
    { name: 'favicon.svg', build: async () => Buffer.from(svg, 'utf8') },
    { name: 'apple-touch-icon.png', build: () => render(180) },
  ]

  async function render(size) {
    return sharp(Buffer.from(rasterSvg, 'utf8'))
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer()
  }

  for (const { name, build } of targets) {
    const target = join(PUBLIC_DIR, name)
    if (existsSync(target) && !force) {
      console.log(`gen-favicon: ${name} exists, leaving it (pass --force to regenerate)`)
      continue
    }
    const bytes = await build()
    writeFileSync(target, bytes)
    console.log(`gen-favicon: wrote public/${name} (${bytes.length} bytes)`)
  }
}

main().catch((error) => {
  console.error(`gen-favicon: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
