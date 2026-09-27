import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const { OUT, URL, TAG, VARIANT, PREFIX, ORBIT, DPR } = process.env
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({
  viewport: { width: 1000, height: 1100 },
  deviceScaleFactor: Number(DPR || 2),
})
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelector('model-viewer')?.loaded === true, null, {
  timeout: 240000,
})
await page.waitForTimeout(2500)
await page.evaluate(
  async ({ VARIANT, PREFIX, ORBIT }) => {
    const mv = document.querySelector('model-viewer')
    if (VARIANT && mv.variantName !== VARIANT) {
      const d = new Promise((r) => mv.addEventListener('variant-applied', r, { once: true }))
      mv.variantName = VARIANT
      await Promise.race([d, new Promise((r) => setTimeout(r, 8000))])
    }
    for (let k = 0; k < 2; k++) {
      mv.setAttribute('camera-orbit', ORBIT || '0deg 90deg auto')
      await mv.updateComplete
      mv.jumpCameraToGoal()
      await new Promise((r) => setTimeout(r, 700))
    }
    const sym = Object.getOwnPropertySymbols(mv).find(
      (s) => s.description === 'scene' && mv[s]?.isObject3D,
    )
    const scene = mv[sym]
    window.__scene = scene
    const set = new Set()
    scene.traverse((o) => {
      if (o.isMesh) for (const m of [].concat(o.material)) if (m.name.startsWith(PREFIX)) set.add(m)
    })
    window.__m = [...set]
    window.__orig = window.__m.map((m) => ({
      t: m.transparent,
      a: m.alphaTest,
      c: m.alphaToCoverage,
      dw: m.depthWrite,
    }))
    window.__render = async () => {
      scene.queueRender()
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => setTimeout(r, 400))
    }
    window.__mode = (mode) => {
      window.__m.forEach((m, i) => {
        const o = window.__orig[i]
        m.transparent = o.t
        m.alphaTest = o.a
        m.alphaToCoverage = o.c
        m.depthWrite = o.dw
        if (mode === 'blend') {
          m.transparent = true
          m.alphaTest = 0
          m.depthWrite = false
        }
        if (mode === 'a2c') {
          m.alphaToCoverage = true
        }
        if (mode === 'cut25') {
          m.alphaTest = 0.25
        }
        m.needsUpdate = true
      })
    }
  },
  { VARIANT, PREFIX, ORBIT },
)
console.log(
  TAG,
  'materials',
  await page.evaluate(() =>
    window.__m.map((m) => `${m.name}:t${m.transparent}:a${m.alphaTest}`).join(' '),
  ),
)
const el = page.locator('model-viewer')
for (const mode of (process.env.MODES || 'live,blend,a2c,cut25').split(',')) {
  await page.evaluate((m) => window.__mode(m), mode)
  await page.evaluate(() => window.__render())
  writeFileSync(`${OUT}/${TAG}-${mode}.png`, await el.screenshot())
}
await browser.close()
