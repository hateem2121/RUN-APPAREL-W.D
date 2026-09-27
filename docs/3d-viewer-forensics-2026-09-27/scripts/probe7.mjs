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
    for (let k = 0; k < 2; k++) {
      mv.setAttribute('camera-orbit', orbit)
      await mv.updateComplete
      mv.jumpCameraToGoal()
      await new Promise((r) => setTimeout(r, 900))
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
const _at = (r) => orbit.replace(/\S+%$|\S+m$/, r)
const _save = async (name) =>
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
await page.evaluate(() => {
  window.__grab = async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => setTimeout(r, 300))
    const blob = await document.querySelector('model-viewer').toBlob({ idealAspect: false })
    const b = await createImageBitmap(blob)
    const c = new OffscreenCanvas(b.width, b.height)
    const x = c.getContext('2d')
    x.drawImage(b, 0, 0)
    return x.getImageData(0, 0, b.width, b.height).data
  }
  window.__blink = (frames) => {
    let blink = 0,
      fg = 0
    const T = 60
    for (let f = 1; f < frames.length - 1; f++) {
      const a = frames[f - 1],
        b = frames[f],
        c = frames[f + 1]
      for (let k = 0; k < b.length; k += 4) {
        if (b[k + 3] < 10) continue
        fg++
        const ab =
          Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2])
        const bc =
          Math.abs(b[k] - c[k]) + Math.abs(b[k + 1] - c[k + 1]) + Math.abs(b[k + 2] - c[k + 2])
        const ac =
          Math.abs(a[k] - c[k]) + Math.abs(a[k + 1] - c[k + 1]) + Math.abs(a[k + 2] - c[k + 2])
        if (ab > T && bc > T && ac < T / 2) blink++
      }
    }
    return {
      blinkPerFrame: +(blink / (frames.length - 2)).toFixed(1),
      pctOfGarment: +((100 * blink) / fg).toFixed(3),
    }
  }
})
await page.evaluate(() => {
  window.__blinkMap = (frames) => {
    const T = 60,
      mid = frames[Math.floor(frames.length / 2)],
      hits = new Uint16Array(mid.length / 4)
    let blink = 0,
      fg = 0
    for (let f = 1; f < frames.length - 1; f++) {
      const a = frames[f - 1],
        b = frames[f],
        c = frames[f + 1]
      for (let k = 0, p = 0; k < b.length; k += 4, p++) {
        if (b[k + 3] < 10) continue
        fg++
        const ab =
          Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2])
        const bc =
          Math.abs(b[k] - c[k]) + Math.abs(b[k + 1] - c[k + 1]) + Math.abs(b[k + 2] - c[k + 2])
        const ac =
          Math.abs(a[k] - c[k]) + Math.abs(a[k + 1] - c[k + 1]) + Math.abs(a[k + 2] - c[k + 2])
        if (ab > T && bc > T && ac < T / 2) {
          blink++
          hits[p]++
        }
      }
    }
    return { pct: +((100 * blink) / fg).toFixed(3), hits }
  }
  window.__normals = (on) => {
    for (const m of window.__mats()) {
      if (!on) {
        m.userData.__nm = m.normalMap
        m.normalMap = null
      } else if (m.userData.__nm) m.normalMap = m.userData.__nm
      m.needsUpdate = true
    }
    window.__scene.queueRender()
  }
})
const base = await page.evaluate(() =>
  document.querySelector('model-viewer').getAttribute('camera-orbit'),
)
const [, phi] = base.split(' ')
const _W = await page.evaluate(() => {
  const _r = document.querySelector('model-viewer')
  return 0
})
for (const mode of ['live', 'noweave']) {
  if (mode === 'noweave') await page.evaluate(() => window.__normals(false))
  const frames = []
  for (let t = 0; t <= 6; t += 0.5) {
    await page.evaluate((o) => window.__view(o), `${t}deg ${phi} 105%`)
    frames.push(await page.evaluateHandle(() => window.__grab()))
  }
  await page.evaluate(() => {
    window.__F = []
  })
  for (const h of frames) await page.evaluate((d) => window.__F.push(d), h)
  const png = await page.evaluate(async () => {
    const { pct, hits } = window.__blinkMap(window.__F)
    const mid = window.__F[Math.floor(window.__F.length / 2)]
    const blob = await document.querySelector('model-viewer').toBlob({ idealAspect: false })
    const bm = await createImageBitmap(blob)
    const W = bm.width,
      H = bm.height
    const c = new OffscreenCanvas(W, H)
    const x = c.getContext('2d')
    const id = x.createImageData(W, H)
    for (let p = 0, k = 0; p < W * H; p++, k += 4) {
      const g = (mid[k] + mid[k + 1] + mid[k + 2]) / 3
      id.data[k] = id.data[k + 1] = id.data[k + 2] = 150 + g * 0.4
      id.data[k + 3] = mid[k + 3]
      if (hits[p]) {
        id.data[k] = 235
        id.data[k + 1] = 0
        id.data[k + 2] = 160
        id.data[k + 3] = 255
      }
    }
    x.putImageData(id, 0, 0)
    const out = await c.convertToBlob({ type: 'image/png' })
    const u = new Uint8Array(await out.arrayBuffer())
    let s = ''
    for (const v of u) s += String.fromCharCode(v)
    return { pct, b64: btoa(s) }
  })
  writeFileSync(`${process.env.OUT}/${tag}-blinkmap-${mode}.png`, Buffer.from(png.b64, 'base64'))
  log[mode] = png.pct
  if (mode === 'noweave') await page.evaluate(() => window.__normals(true))
}
log.counts = await page.evaluate(() => window.__counts())
console.log(tag, JSON.stringify(log))
await browser.close()
