import { chromium } from '@playwright/test'
const { URL, VARIANT, PREFIX } = process.env
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({
  viewport: { width: 1000, height: 1100 },
  deviceScaleFactor: 1,
})
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelector('model-viewer')?.loaded === true, null, {
  timeout: 240000,
})
await page.waitForTimeout(2500)
const out = await page.evaluate(
  async ({ VARIANT, PREFIX }) => {
    const mv = document.querySelector('model-viewer')
    if (VARIANT && mv.variantName !== VARIANT) {
      const d = new Promise((r) => mv.addEventListener('variant-applied', r, { once: true }))
      mv.variantName = VARIANT
      await Promise.race([d, new Promise((r) => setTimeout(r, 8000))])
    }
    const sym = Object.getOwnPropertySymbols(mv).find(
      (s) => s.description === 'scene' && mv[s]?.isObject3D,
    )
    const scene = mv[sym]
    const seen = new Map()
    scene.traverse((o) => {
      if (!o.isMesh) return
      const m = [].concat(o.material)[0]
      if (!m.name.startsWith(PREFIX) || seen.has(m.uuid)) return
      seen.set(m.uuid, {
        name: m.name,
        type: m.type,
        color: m.color?.getHexString(),
        colorLinear: m.color?.toArray().map((x) => +x.toFixed(4)),
        opacity: m.opacity,
        transparent: m.transparent,
        alphaTest: m.alphaTest,
        blending: m.blending,
        premultipliedAlpha: m.premultipliedAlpha,
        depthWrite: m.depthWrite,
        side: m.side,
        map: m.map
          ? {
              w: m.map.image?.width,
              h: m.map.image?.height,
              colorSpace: m.map.colorSpace,
              format: m.map.format,
            }
          : null,
        polygonOffset: m.polygonOffset,
        pof: m.polygonOffsetFactor,
        roughness: m.roughness,
        metalness: m.metalness,
        specularIntensity: m.specularIntensity,
        specularColor: m.specularColor?.getHexString(),
        emissive: m.emissive?.getHexString(),
        visible: o.visible,
        renderOrder: o.renderOrder,
        userData: Object.keys(m.userData || {}),
      })
    })
    return { variant: mv.variantName, mats: [...seen.values()] }
  },
  { VARIANT, PREFIX },
)
console.log(JSON.stringify(out, null, 1))
await browser.close()
