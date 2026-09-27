import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const [url, tag, dprArg, _mode] = process.argv.slice(2)
const DPR = Number(dprArg || 1)
const browser = await chromium.launch({
  proxy: { server: 'http://127.0.0.1:39285' },
  args: [
    `--ignore-certificate-errors-spki-list=${process.env.SPKI}`,
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
  ],
})
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: DPR,
})
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelector('model-viewer')?.loaded === true, null, {
  timeout: 240000,
})
await page.waitForTimeout(3000)
await page.evaluate(() => {
  const mv = document.querySelector('model-viewer')
  const sym = Object.getOwnPropertySymbols(mv).find(
    (s) => s.description === 'scene' && mv[s]?.isObject3D,
  )
  const scene = mv[sym]
  window.__scene = scene
  window.__mats = () => {
    const set = new Set()
    scene.traverse((o) => {
      if (o.isMesh)
        [].concat(o.material).forEach((m) => {
          set.add(m)
        })
    })
    return [...set]
  }
  window.__view = async (orbit) => {
    for (let k = 0; k < 6; k++) {
      mv.setAttribute('camera-orbit', orbit)
      await mv.updateComplete
      mv.jumpCameraToGoal()
      await new Promise((r) => setTimeout(r, 2500))
    }
  }
  window.__shot = async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => setTimeout(r, 500))
    const blob = await mv.toBlob({ idealAspect: false })
    const fr = new FileReader()
    return await new Promise((r) => {
      fr.onload = () => r(fr.result)
      fr.readAsDataURL(blob)
    })
  }
  window.__cam = () => ({
    near: scene.camera.near,
    far: scene.camera.far,
    radius: mv.getCameraOrbit().radius,
  })
  window.__mips = (on) => {
    let n = 0
    for (const m of window.__mats())
      if (m.alphaTest > 0 && m.map) {
        m.map.minFilter = on ? 1008 : 1006
        m.map.generateMipmaps = on
        m.map.needsUpdate = true
        n++
      }
    scene.queueRender()
    return n
  }
  window.__a2c = (on) => {
    let n = 0
    for (const m of window.__mats())
      if (m.alphaTest > 0) {
        m.alphaToCoverage = on
        m.needsUpdate = true
        n++
      }
    scene.queueRender()
    return n
  }
  window.__biasBlend = (on) => {
    const names = []
    for (const m of window.__mats())
      if (
        m.transparent &&
        !m.polygonOffset !== !on &&
        (on ? !m.polygonOffset : m.userData.__probe)
      ) {
        m.polygonOffset = on
        m.polygonOffsetFactor = on ? -8 : 0
        m.polygonOffsetUnits = on ? -8 : 0
        m.userData.__probe = on
        m.needsUpdate = true
        names.push(m.name)
      }
    scene.queueRender()
    return names
  }
  window.__counts = () => {
    const ms = window.__mats()
    return {
      drawn: ms.length,
      mask: ms.filter((m) => m.alphaTest > 0).length,
      blend: ms.filter((m) => m.transparent).length,
      blendBiased: ms.filter((m) => m.transparent && m.polygonOffset).length,
      opaqueBiased: ms.filter((m) => !m.transparent && !(m.alphaTest > 0) && m.polygonOffset)
        .length,
    }
  }
})
const orbit = await page.evaluate(() =>
  document.querySelector('model-viewer').getAttribute('camera-orbit'),
)
const at = (r) => orbit.replace(/\S+%$|\S+m$/, r)
const save = async (name) =>
  writeFileSync(
    `${process.env.OUT}/${tag}-${name}.png`,
    Buffer.from((await page.evaluate(() => window.__shot())).split(',')[1], 'base64'),
  )
const log = {}
await page.evaluate(() => {
  window.__biased = () =>
    window
      .__mats()
      .filter((m) => m.polygonOffset)
      .map((m) => ({ m, f: m.polygonOffsetFactor, u: m.polygonOffsetUnits }))
  window.__saved = window.__biased()
  window.__restore = () => {
    for (const s of window.__saved) {
      s.m.polygonOffset = true
      s.m.polygonOffsetFactor = s.f
      s.m.polygonOffsetUnits = s.u
      s.m.needsUpdate = true
    }
    window.__scene.queueRender()
  }
  window.__set = (pred, factor, units, on) => {
    const n = []
    for (const s of window.__saved)
      if (pred(s.m.name)) {
        s.m.polygonOffset = on
        s.m.polygonOffsetFactor = factor
        s.m.polygonOffsetUnits = units
        s.m.needsUpdate = true
        n.push(s.m.name)
      }
    window.__scene.queueRender()
    return n
  }
})
await page.evaluate((o) => window.__view(o), at('200%'))
log.cam = await page.evaluate(() => window.__cam())
await page.evaluate(() => window.__set(() => true, 0, 0, false))
await save('off200')
await page.evaluate(() => window.__restore())
await save('on200')
log.counts = await page.evaluate(() => window.__counts())
console.log(tag, JSON.stringify(log))
await browser.close()
