import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
const b = await chromium.launch()
const p = await b.newPage()
for (const n of process.argv.slice(2)) {
  const src = `data:image/png;base64,${readFileSync(`${process.env.OUT}/${n}.png`).toString('base64')}`
  const out = await p.evaluate(async (s) => {
    const i = new Image()
    i.src = s
    await i.decode()
    const c = new OffscreenCanvas(i.width, i.height)
    const x = c.getContext('2d')
    x.fillStyle = '#fff'
    x.fillRect(0, 0, i.width, i.height)
    x.drawImage(i, 0, 0)
    const bl = await c.convertToBlob({ type: 'image/webp', quality: 0.86 })
    const u = new Uint8Array(await bl.arrayBuffer())
    let t = ''
    for (const v of u) t += String.fromCharCode(v)
    return { w: i.width, h: i.height, b64: btoa(t) }
  }, src)
  writeFileSync(`${process.env.OUT}/${n}.webp.b64`, out.b64)
  console.log(n, `${out.w}x${out.h}`, `${Math.round(out.b64.length / 1024)} KB`)
}
await b.close()
