#!/usr/bin/env node
/**
 * What a browser actually makes GPU-resident for a garment — measured, not estimated
 * (fix plan Rank 10; audit LIVE-07, TEX-02).
 *
 * Loads the file on the render harness page in a real Chromium, switches through every
 * colourway so model-viewer builds every material, then walks the three.js scene and
 * every built material and sums each unique texture's decoded size at 4 bytes a pixel
 * plus a third for mipmaps — the audit's method, kept in the repo so the number can be
 * re-measured after any texture change. Compare with the pipeline's own estimate
 * (`phone GPU:` in `pipeline optimize`): they should agree; a gap is a texture the
 * viewer builds that the file does not declare, or the reverse.
 *
 * Usage (from tools/asset-pipeline):
 *   npx tsx scripts/gpu-memory-probe.mjs <file.glb> [--json]
 */
import { chromium } from '@playwright/test'
import { renderHarnessPage, startHarnessServer } from '../src/render.ts'

const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
const asJson = process.argv.includes('--json')
if (!file) {
  console.error('usage: gpu-memory-probe.mjs <file.glb> [--json]')
  process.exit(1)
}
const { server, port } = await startHarnessServer(file, renderHarnessPage({}))
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
})
try {
  const page = await browser.newPage({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 1,
  })
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction('window.__ready !== undefined', null, { timeout: 60_000 })
  await page.evaluate('window.__ready')
  const scan = () =>
    page.evaluate(`(async () => {
      const mv = document.getElementById('mv')
      const variants = Array.from(mv.availableVariants ?? [])
      for (const v of variants) {
        mv.variantName = v
        await new Promise((r) => mv.addEventListener('variant-applied', r, { once: true }))
        await mv.updateComplete
      }
      const textures = new Map()
      const SLOTS = ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap']
      const add = (m) => { for (const s of SLOTS) { const t = m && m[s]; const img = t && t.image; if (img && (img.width || img.naturalWidth)) textures.set(t.uuid, { slot: s, w: img.width || img.naturalWidth, h: img.height || img.naturalHeight, src: t.source && t.source.data ? t.source.data.src : undefined }) } }
      let root = null
      for (const sym of Object.getOwnPropertySymbols(mv)) { const v = mv[sym]; if (v && v.isObject3D) { root = v; break } }
      if (root) root.traverse((o) => { const m = o.material; if (!m) return; (Array.isArray(m) ? m : [m]).forEach(add) })
      let built = 0
      for (const m of (mv.model ? mv.model.materials : [])) {
        for (const source of [m, Object.getPrototypeOf(m)]) {
          if (!source) continue
          for (const sym of Object.getOwnPropertySymbols(source)) {
            if (sym.description !== 'correlatedObjects') continue
            const set = m[sym]; if (!set) continue
            for (const b of set) { built++; add(b) }
          }
        }
      }
      // Unique by decoded picture (three.js shares one image across clones).
      const bySource = new Map()
      for (const t of textures.values()) { const k = (t.src ?? '') + t.w + 'x' + t.h; if (!bySource.has(k)) bySource.set(k, t) }
      const rows = [...bySource.values()]
      const bytes = rows.reduce((a, r) => a + r.w * r.h * 4 * (4 / 3), 0)
      return { variants, builtMaterials: built, uniqueTextures: rows.length, gpuBytes: Math.round(bytes), textures: rows.map((r) => ({ slot: r.slot, size: r.w + 'x' + r.h, mb: +(r.w * r.h * 4 * (4 / 3) / 1048576).toFixed(1) })) }
    })()`)
  const result = await scan()
  if (asJson) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`${file}`)
    console.log(
      `  colourways visited: ${result.variants.length} (${result.variants.join(', ') || 'none'})`,
    )
    console.log(`  materials built:    ${result.builtMaterials}`)
    console.log(`  unique textures:    ${result.uniqueTextures}`)
    console.log(
      `  GPU texture memory: ${(result.gpuBytes / 1048576).toFixed(1)} MB (4 bytes/pixel + mipmaps)`,
    )
    for (const t of result.textures.sort((a, b) => b.mb - a.mb).slice(0, 8))
      console.log(`    ${String(t.mb).padStart(6)} MB  ${t.size.padEnd(10)} ${t.slot}`)
  }
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(() => resolve()))
}
