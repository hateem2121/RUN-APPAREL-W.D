import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const { OUT, URL, TAG, VARIANT, PREFIXES, ORBIT } = process.env
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
  async ({ VARIANT, ORBIT }) => {
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
    window.__scene = mv[sym]
    window.__meshes = []
    window.__scene.traverse((o) => {
      if (o.isMesh) window.__meshes.push(o)
    })
    window.__render = async () => {
      window.__scene.queueRender()
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => setTimeout(r, 400))
    }
  },
  { VARIANT, ORBIT },
)
const el = page.locator('model-viewer')
const snap = async (n) => {
  await page.evaluate(() => window.__render())
  writeFileSync(`${OUT}/${TAG}-${n}.png`, await el.screenshot())
}
await snap('as-live')
for (const p of PREFIXES.split('|')) {
  const n = await page.evaluate((p) => {
    let n = 0
    for (const o of window.__meshes)
      if ([].concat(o.material)[0].name.startsWith(p)) {
        o.visible = false
        n++
      }
    return n
  }, p)
  console.log(TAG, 'hid', p, n, 'meshes')
  await snap(`hide-${p.replace(/\W+/g, '_')}`)
  await page.evaluate((p) => {
    for (const o of window.__meshes)
      if ([].concat(o.material)[0].name.startsWith(p)) o.visible = true
  }, p)
}
console.log(
  TAG,
  'materials drawn:',
  await page.evaluate(() =>
    [
      ...new Set(
        window.__meshes
          .filter((o) => o.visible)
          .map((o) => [].concat(o.material)[0].name.replace(/_\d+$/, '')),
      ),
    ].join(' | '),
  ),
)
await browser.close()
