// Experiments only: mutates the live page's in-memory scene, saves screenshots to scratch.
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const { OUT, URL, TAG, MODES, VIEWS, UNCOVER } = process.env
const views = JSON.parse(VIEWS) // {name: "orbit"}
const uncover = JSON.parse(UNCOVER || '[]') // triangle counts of pieces to un-nudge
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
await page.waitForTimeout(3000)
await page.evaluate((uncover) => {
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
  window.__meshes = meshes
  const tri = (o) =>
    (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3
  const mats = new Set()
  for (const o of meshes) for (const m of [].concat(o.material)) mats.add(m)
  window.__mats = [...mats]
  window.__orig = new Map(
    window.__mats.map((m) => [
      m,
      {
        po: m.polygonOffset,
        f: m.polygonOffsetFactor,
        u: m.polygonOffsetUnits,
        a2c: m.alphaToCoverage,
        at: m.alphaTest,
        tr: m.transparent,
        dw: m.depthWrite,
        nm: m.normalMap,
        ns: m.normalScale?.clone(),
      },
    ]),
  )
  window.__origMat = new Map(meshes.map((o) => [o, o.material]))
  const solidBiased = (m) =>
    window.__orig.get(m).po && !(window.__orig.get(m).at > 0) && !window.__orig.get(m).tr
  const stitch = (m) => /stitch|thread/i.test(m.name)
  window.__reset = () => {
    for (const [m, o] of window.__orig) {
      m.polygonOffset = o.po
      m.polygonOffsetFactor = o.f
      m.polygonOffsetUnits = o.u
      m.alphaToCoverage = o.a2c
      m.alphaTest = o.at
      m.transparent = o.tr
      m.depthWrite = o.dw
      m.normalMap = o.nm
      if (o.ns) m.normalScale.copy(o.ns)
      m.needsUpdate = true
    }
    for (const [o, m] of window.__origMat) o.material = m
  }
  window.__modes = {
    live: () => {},
    plantFight: () => {
      for (const m of window.__mats)
        if (solidBiased(m)) {
          m.polygonOffsetFactor = 1
          m.polygonOffsetUnits = 1
          m.needsUpdate = true
        }
    },
    plantFight4: () => {
      for (const m of window.__mats)
        if (solidBiased(m)) {
          m.polygonOffsetFactor = 0
          m.polygonOffsetUnits = 4
          m.needsUpdate = true
        }
    },
    nudgeOffSolid: () => {
      for (const m of window.__mats)
        if (solidBiased(m)) {
          m.polygonOffset = false
          m.needsUpdate = true
        }
    },
    factor4: () => {
      for (const m of window.__mats)
        if (solidBiased(m)) {
          m.polygonOffsetFactor = -4
          m.needsUpdate = true
        }
    },
    factor2: () => {
      for (const m of window.__mats)
        if (solidBiased(m)) {
          m.polygonOffsetFactor = -2
          m.needsUpdate = true
        }
    },
    factor1: () => {
      for (const m of window.__mats)
        if (solidBiased(m)) {
          m.polygonOffsetFactor = -1
          m.needsUpdate = true
        }
    },
    factor0units64: () => {
      for (const m of window.__mats)
        if (solidBiased(m)) {
          m.polygonOffsetFactor = 0
          m.polygonOffsetUnits = -64
          m.needsUpdate = true
        }
    },
    uncoverOnly: () => {
      for (const o of meshes)
        if (uncover.includes(tri(o))) {
          const c = [].concat(o.material)[0].clone()
          c.polygonOffset = false
          o.material = c
        }
    },
    a2cMask: () => {
      for (const m of window.__mats)
        if (m.alphaTest > 0) {
          m.alphaToCoverage = true
          m.needsUpdate = true
        }
    },
    normalHalf: () => {
      for (const m of window.__mats)
        if (m.normalMap && !stitch(m)) {
          m.normalScale.multiplyScalar(0.5)
          m.needsUpdate = true
        }
    },
    normalOff: () => {
      for (const m of window.__mats)
        if (m.normalMap) {
          m.normalMap = null
          m.needsUpdate = true
        }
    },
    stitchMask: () => {
      for (const m of window.__mats)
        if (stitch(m) && m.transparent) {
          m.transparent = false
          m.alphaTest = 0.5
          m.depthWrite = true
          m.needsUpdate = true
        }
    },
    stitchMaskA2C: () => {
      for (const m of window.__mats)
        if (stitch(m)) {
          m.transparent = false
          m.alphaTest = 0.3
          m.alphaToCoverage = true
          m.depthWrite = true
          m.needsUpdate = true
        }
    },
    stitchBlend: () => {
      for (const m of window.__mats)
        if (stitch(m)) {
          m.transparent = true
          m.alphaTest = 0
          m.depthWrite = false
          m.needsUpdate = true
        }
    },
  }
  window.__render = async () => {
    scene.queueRender()
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => setTimeout(r, 350))
  }
  window.__view = async (orbit) => {
    for (let k = 0; k < 2; k++) {
      mv.setAttribute('camera-orbit', orbit)
      await mv.updateComplete
      mv.jumpCameraToGoal()
      await new Promise((r) => setTimeout(r, 500))
    }
    return mv.getCameraOrbit().toString()
  }
  return true
}, uncover)
const el = page.locator('model-viewer')
for (const mode of MODES.split(',')) {
  await page.evaluate((mode) => {
    window.__reset()
    window.__modes[mode]()
  }, mode)
  for (const [vn, orbit] of Object.entries(views)) {
    const [th, ph, r] = orbit.split(' ')
    for (const d of [-0.5, 0, 0.5]) {
      // three frames half a degree apart, for the blink metric
      await page.evaluate((o) => window.__view(o), `${parseFloat(th) + d}deg ${ph} ${r}`)
      await page.evaluate(() => window.__render())
      writeFileSync(`${OUT}/${TAG}__${mode}__${vn}__${d}.png`, await el.screenshot())
    }
  }
  console.log(TAG, mode, 'done')
}
await browser.close()
