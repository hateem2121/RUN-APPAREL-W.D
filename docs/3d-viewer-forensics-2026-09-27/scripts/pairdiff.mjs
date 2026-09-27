import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const D = process.env.OUT
const pairs = process.argv.slice(2).map((p) => p.split(':'))
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [a, b] of pairs) {
  const r = await page.evaluate(
    async ([A, B]) => {
      const load = async (s) => {
        const i = new Image()
        i.src = s
        await i.decode()
        const c = new OffscreenCanvas(i.width, i.height)
        const x = c.getContext('2d')
        x.drawImage(i, 0, 0)
        return x.getImageData(0, 0, i.width, i.height).data
      }
      const p = await load(A),
        q = await load(B)
      let fg = 0,
        n = 0
      for (let k = 0; k < p.length; k += 4) {
        if (p[k + 3] < 10 && q[k + 3] < 10) continue
        fg++
        if (
          Math.abs(p[k] - q[k]) + Math.abs(p[k + 1] - q[k + 1]) + Math.abs(p[k + 2] - q[k + 2]) >
          60
        )
          n++
      }
      return { fg, n, pct: +((100 * n) / fg).toFixed(2) }
    },
    [
      `data:image/png;base64,${readFileSync(`${D}/${a}.png`).toString('base64')}`,
      `data:image/png;base64,${readFileSync(`${D}/${b}.png`).toString('base64')}`,
    ],
  )
  console.log(a, 'vs', b, JSON.stringify(r))
}
await browser.close()
