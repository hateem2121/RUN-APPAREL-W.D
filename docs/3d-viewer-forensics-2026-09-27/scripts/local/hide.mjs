import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const OUT = process.env.OUT,
  url = process.env.URL,
  tag = process.env.TAG
const hide = JSON.parse(process.env.HIDE) // [{tris, name}]
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({
  viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 900) },
  deviceScaleFactor: Number(process.env.DPR || 1),
})
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelector('model-viewer')?.loaded === true, null, {
  timeout: 240000,
})
await page.waitForTimeout(3000)
const info = await page.evaluate((hide) => {
  const mv = document.querySelector('model-viewer')
  const sym = Object.getOwnPropertySymbols(mv).find(
    (s) => s.description === 'scene' && mv[s]?.isObject3D,
  )
  const scene = mv[sym]
  window.__scene = scene
  const meshes = []
  scene.traverse((o) => {
    if (o.isMesh) meshes.push(o)
  })
  const tri = (o) =>
    (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3
  window.__targets = hide.map((h) =>
    meshes.filter((o) => tri(o) === h.tris && [].concat(o.material)[0].name.startsWith(h.name)),
  )
  window.__render = async () => {
    scene.queueRender()
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => setTimeout(r, 400))
  }
  window.__view = async (orbit) => {
    for (let k = 0; k < 2; k++) {
      mv.setAttribute('camera-orbit', orbit)
      await mv.updateComplete
      mv.jumpCameraToGoal()
      await new Promise((r) => setTimeout(r, 900))
    }
    return mv.getCameraOrbit().toString()
  }
  return {
    found: window.__targets.map((t) => t.length),
    orbit: mv.getAttribute('camera-orbit'),
    max: mv.getAttribute('max-camera-orbit'),
    meshes: meshes.length,
  }
}, hide)
console.log(tag, JSON.stringify(info))
const el = page.locator('model-viewer')
const snap = async (n) => {
  await page.evaluate(() => window.__render())
  writeFileSync(`${OUT}/${tag}-${n}.png`, await el.screenshot())
}
const orbits = JSON.parse(process.env.ORBITS)
for (const [vn, o] of Object.entries(orbits)) {
  const got = await page.evaluate((o) => window.__view(o), o)
  console.log(' view', vn, 'asked', o, 'got', got)
  await snap(`${vn}-as-live`)
  for (let h = 0; h < hide.length; h++) {
    await page.evaluate((h) => {
      for (const m of window.__targets[h]) m.visible = false
    }, h)
    await snap(`${vn}-hide-${hide[h].label}`)
    await page.evaluate((h) => {
      for (const m of window.__targets[h]) m.visible = true
    }, h)
  }
  await page.evaluate(() => {
    window.__saved = []
    window.__scene.traverse((o) => {
      if (o.isMesh)
        for (const m of [].concat(o.material))
          if (m.polygonOffset && !(m.alphaTest > 0)) {
            window.__saved.push(m)
            m.polygonOffset = false
            m.needsUpdate = true
          }
    })
  })
  await snap(`${vn}-nudge-off-solid`)
  await page.evaluate(() => {
    for (const m of window.__saved) {
      m.polygonOffset = true
      m.needsUpdate = true
    }
  })
  await snap(`${vn}-as-live-again`)
}
await browser.close()
