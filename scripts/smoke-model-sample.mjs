/** Called by uptime.yml: complete transfers for the reported jersey, flagship, hoodie and a rotating row. */
import { spawnSync } from 'node:child_process'
import { LIVE_PRODUCTS } from './live-products.mjs'
const interactive = LIVE_PRODUCTS.filter((product) => !product.modelComingSoon)
const rotation = interactive[Math.floor(Date.now() / (6 * 60 * 60 * 1000)) % interactive.length]
const sample = [...new Set(['r-vpj', 'rxps', 'r-afp', rotation?.slug])]
let failed = false
for (const slug of sample) {
  const product = interactive.find((row) => row.slug === slug)
  if (!product) {
    console.error(`Missing monitored product: ${slug}`)
    failed = true
    continue
  }
  const result = spawnSync(
    process.execPath,
    [
      new URL('./smoke-viewer-payload.mjs', import.meta.url).pathname,
      'https://cms.wear-run.help',
      product.slug,
      product.colourway,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, SMOKE_COMPLETE_MODEL: '1' },
    },
  )
  if (result.status !== 0) failed = true
}
if (failed) process.exitCode = 1
