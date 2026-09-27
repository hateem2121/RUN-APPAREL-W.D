import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const { OUT, URL, TAG, VARIANT, PREFIX } = process.env
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({
  viewport: { width: 1000, height: 1100 },
  deviceScaleFactor: 2,
})
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelector('model-viewer')?.loaded === true, null, {
  timeout: 240000,
})
await page.waitForTimeout(2500)
await page.evaluate(
  async ({ VARIANT, PREFIX }) => {
    const mv = document.querySelector('model-viewer')
    if (VARIANT && mv.variantName !== VARIANT) {
      const d = new Promise((r) => mv.addEventListener('variant-applied', r, { once: true }))
      mv.variantName = VARIANT
      await Promise.race([d, new Promise((r) => setTimeout(r, 8000))])
    }
    for (let k = 0; k < 2; k++) {
      mv.setAttribute('camera-orbit', '0deg 90deg auto')
      await mv.updateComplete
      mv.jumpCameraToGoal()
      await new Promise((r) => setTimeout(r, 700))
    }
    const sym = Object.getOwnPropertySymbols(mv).find(
      (s) => s.description === 'scene' && mv[s]?.isObject3D,
    )
    const scene = mv[sym]
    window.__scene = scene
    window.__t = []
    scene.traverse((o) => {
      if (o.isMesh && [].concat(o.material)[0].name.startsWith(PREFIX)) window.__t.push(o)
    })
    window.__render = async () => {
      scene.queueRender()
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => setTimeout(r, 400))
    }
    // how many of the print meshes face INWARD? (average normal vs direction from garment centre)
    const _box = new (scene.boundingBox?.constructor || Object)()
    window.__facing = window.__t.map((o) => {
      const g = o.geometry
      const _n = g.attributes.normal,
        p = g.attributes.position
      const _dot = 0
      const _c = scene.boundingBox
        ? scene.boundingBox.getCenter(
            new p.array.constructor(3).constructor === Float32Array
              ? scene.boundingBox.min.clone()
              : scene.boundingBox.min.clone(),
          )
        : null
      return { tris: (g.index ? g.index.count : p.count) / 3 }
    })
  },
  { VARIANT, PREFIX },
)
const el = page.locator('model-viewer')
const snap = async (n) => {
  await page.evaluate(() => window.__render())
  writeFileSync(`${OUT}/${TAG}-${n}.png`, await el.screenshot())
}
await snap('as-live')
await page.evaluate(() => {
  for (const o of window.__t) {
    const m = [].concat(o.material)[0]
    m.side = 0
    m.needsUpdate = true
  }
})
await snap('front-side-only')
await page.evaluate(() => {
  for (const o of window.__t) {
    const m = [].concat(o.material)[0]
    m.side = 2
    m.needsUpdate = true
    o.visible = false
  }
})
await snap('hidden')
console.log(TAG, JSON.stringify(await page.evaluate(() => window.__facing)))
await browser.close()
