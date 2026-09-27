import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
const D = process.env.OUT
const [ref, ...others] = process.argv.slice(2)
const b64 = (f) => `data:image/png;base64,${readFileSync(`${D}/${f}.png`).toString('base64')}`
const browser = await chromium.launch()
const page = await browser.newPage()
const res = await page.evaluate(
  async ({ ref, others, imgs }) => {
    const load = async (src) => {
      const i = new Image()
      i.src = src
      await i.decode()
      return i
    }
    const R = await load(imgs[ref])
    const first = await load(imgs[others[0]])
    const W = first.width,
      H = first.height
    const c = new OffscreenCanvas(W, H)
    const x = c.getContext('2d', { willReadFrequently: true })
    x.imageSmoothingEnabled = true
    x.imageSmoothingQuality = 'high'
    // downsample 4x reference by averaging 4x4 blocks (exact box filter)
    const big = new OffscreenCanvas(R.width, R.height).getContext('2d')
    big.drawImage(R, 0, 0)
    const rb = big.getImageData(0, 0, R.width, R.height).data
    const f = Math.round(R.height / H)
    const refD = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++)
      for (let X = 0; X < W; X++) {
        const acc = [0, 0, 0, 0]
        for (let j = 0; j < f; j++)
          for (let i = 0; i < f; i++) {
            const p = ((y * f + j) * R.width + (X * f + i)) * 4
            for (let k = 0; k < 4; k++) acc[k] += rb[p + k]
          }
        for (let k = 0; k < 4; k++) refD[(y * W + X) * 4 + k] = acc[k] / (f * f)
      }
    const get = async (n) => {
      const im = await load(imgs[n])
      x.clearRect(0, 0, W, H)
      x.drawImage(im, 0, 0)
      return x.getImageData(0, 0, W, H).data
    }
    // bounding box of garment
    let minx = W,
      miny = H,
      maxx = 0,
      maxy = 0,
      fg = 0
    for (let y = 0; y < H; y++)
      for (let X = 0; X < W; X++)
        if (refD[(y * W + X) * 4 + 3] > 10) {
          fg++
          minx = Math.min(minx, X)
          maxx = Math.max(maxx, X)
          miny = Math.min(miny, y)
          maxy = Math.max(maxy, y)
        }
    const out = { fg, box: [minx, miny, maxx, maxy] }
    const datas = {}
    for (const n of others) {
      const d = await get(n)
      datas[n] = d
      let err = 0,
        big = 0,
        lighter = 0
      for (let p = 0; p < d.length; p += 4) {
        if (refD[p + 3] < 10 && d[p + 3] < 10) continue
        const e =
          Math.abs(d[p] - refD[p]) +
          Math.abs(d[p + 1] - refD[p + 1]) +
          Math.abs(d[p + 2] - refD[p + 2])
        err += e
        if (e > 60) {
          big++
          if (d[p] + d[p + 1] + d[p + 2] > refD[p] + refD[p + 1] + refD[p + 2]) lighter++
        }
      }
      out[n] = {
        meanErr: +(err / fg).toFixed(2),
        bigErrPx: big,
        bigErrPct: +((100 * big) / fg).toFixed(2),
        ofWhichLighter: lighter,
      }
    }
    // contact sheet: crop box, scale 3x nearest, columns: ref, each other, diff(base vs ref)
    const cw = maxx - minx + 1,
      ch = maxy - miny + 1,
      s = 3,
      cols = 1 + others.length
    const sheet = new OffscreenCanvas(cw * s * cols + 10 * (cols - 1), ch * s + 40)
    const sx = sheet.getContext('2d')
    sx.fillStyle = '#fff'
    sx.fillRect(0, 0, sheet.width, sheet.height)
    sx.imageSmoothingEnabled = false
    const put = (data, col, label, diffAgainst) => {
      const t = new OffscreenCanvas(cw, ch)
      const tx = t.getContext('2d')
      const id = tx.createImageData(cw, ch)
      for (let y = 0; y < ch; y++)
        for (let X = 0; X < cw; X++) {
          const p = ((y + miny) * W + (X + minx)) * 4,
            q = (y * cw + X) * 4
          for (let k = 0; k < 4; k++) id.data[q + k] = data[p + k]
          if (diffAgainst) {
            const e =
              Math.abs(data[p] - diffAgainst[p]) +
              Math.abs(data[p + 1] - diffAgainst[p + 1]) +
              Math.abs(data[p + 2] - diffAgainst[p + 2])
            if (e > 60) {
              id.data[q] = 255
              id.data[q + 1] = 0
              id.data[q + 2] = 200
              id.data[q + 3] = 255
            }
          }
        }
      tx.putImageData(id, 0, 0)
      sx.drawImage(t, col * (cw * s + 10), 40, cw * s, ch * s)
      sx.fillStyle = '#000'
      sx.font = '16px sans-serif'
      sx.fillText(label, col * (cw * s + 10) + 4, 24)
    }
    put(refD, 0, 'REFERENCE: 4x sharp, nudge OFF')
    others.forEach((n, i) => {
      put(datas[n], i + 1, `${n} (pink = wrong vs reference)`, refD)
    })
    const blob = await sheet.convertToBlob({ type: 'image/png' })
    const buf = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (const b of buf) bin += String.fromCharCode(b)
    out.sheet = btoa(bin)
    return out
  },
  { ref, others, imgs: Object.fromEntries([ref, ...others].map((n) => [n, b64(n)])) },
)
writeFileSync(`${D}/sheet-${ref}.png`, Buffer.from(res.sheet, 'base64'))
delete res.sheet
console.log(JSON.stringify(res, null, 1))
await browser.close()
