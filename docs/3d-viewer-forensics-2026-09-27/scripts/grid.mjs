import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
const D = process.env.OUT
const [out, rowsArg, colsArg, labelsArg, H0] = process.argv.slice(2)
const rows = rowsArg.split(','),
  cols = colsArg.split(','),
  labels = labelsArg.split('|')
const imgs = {}
for (const r of rows)
  for (const c of cols)
    imgs[r + c] = `data:image/png;base64,${readFileSync(`${D}/${r}${c}.png`).toString('base64')}`
const browser = await chromium.launch()
const page = await browser.newPage()
const b = await page.evaluate(
  async ({ rows, cols, labels, imgs, H }) => {
    const load = async (s) => {
      const i = new Image()
      i.src = s
      await i.decode()
      return i
    }
    const crop = async (src) => {
      const im = await load(src)
      const c = new OffscreenCanvas(im.width, im.height)
      const x = c.getContext('2d')
      x.drawImage(im, 0, 0)
      const d = x.getImageData(0, 0, im.width, im.height).data
      let a = im.width,
        b = im.height,
        e = 0,
        f = 0
      for (let y = 0; y < im.height; y++)
        for (let X = 0; X < im.width; X++)
          if (d[(y * im.width + X) * 4 + 3] > 10) {
            a = Math.min(a, X)
            e = Math.max(e, X)
            b = Math.min(b, y)
            f = Math.max(f, y)
          }
      return { im, a, b, w: e - a + 1, h: f - b + 1 }
    }
    const cells = []
    for (const r of rows) for (const c of cols) cells.push(await crop(imgs[r + c]))
    const widths = cols.map((_, j) =>
      Math.max(
        ...rows.map((_, i) => {
          const k = cells[i * cols.length + j]
          return Math.round((k.w * H) / k.h)
        }),
      ),
    )
    const W = widths.reduce((s, w) => s + w + 12, 150)
    const sheet = new OffscreenCanvas(W, rows.length * (H + 12) + 34)
    const x = sheet.getContext('2d')
    x.fillStyle = '#fff'
    x.fillRect(0, 0, W, sheet.height)
    x.imageSmoothingEnabled = false
    x.fillStyle = '#000'
    x.font = 'bold 15px sans-serif'
    let X0 = 150
    cols.forEach((c, j) => {
      x.fillText(labels[rows.length + j] ?? c, X0 + 4, 22)
      X0 += widths[j] + 12
    })
    rows.forEach((r, i) => {
      x.fillText(labels[i] ?? r, 6, 34 + i * (H + 12) + H / 2)
      let X1 = 150
      cols.forEach((_c, j) => {
        const k = cells[i * cols.length + j]
        const w = Math.round((k.w * H) / k.h)
        x.drawImage(k.im, k.a, k.b, k.w, k.h, X1, 34 + i * (H + 12), w, H)
        X1 += widths[j] + 12
      })
    })
    const blob = await sheet.convertToBlob({ type: 'image/png' })
    const u = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (const v of u) s += String.fromCharCode(v)
    return btoa(s)
  },
  { rows, cols, labels, imgs, H: Number(H0 || 360) },
)
writeFileSync(`${D}/${out}.png`, Buffer.from(b, 'base64'))
await browser.close()
