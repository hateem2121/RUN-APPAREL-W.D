import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const OUT = process.env.OUT
const list = process.env.LIST.split(' ')
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})
for (const item of list) {
  const [path, tag] = item.split('=')
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1100 },
    deviceScaleFactor: 2,
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  try {
    await page.goto(`https://viewer.wear-run.help/${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => document.querySelector('model-viewer')?.loaded === true,
      null,
      { timeout: 240000 },
    )
    await page.waitForTimeout(2500)
    const variants = await page.evaluate(
      () => document.querySelector('model-viewer').availableVariants,
    )
    for (const v of variants) {
      await page.evaluate(async (v) => {
        const mv = document.querySelector('model-viewer')
        if (mv.variantName !== v) {
          const done = new Promise((r) => mv.addEventListener('variant-applied', r, { once: true }))
          mv.variantName = v
          await Promise.race([done, new Promise((r) => setTimeout(r, 8000))])
        }
        for (let k = 0; k < 2; k++) {
          mv.setAttribute('camera-orbit', '0deg 90deg auto')
          mv.setAttribute('camera-target', 'auto auto auto')
          await mv.updateComplete
          mv.jumpCameraToGoal()
          await new Promise((r) => setTimeout(r, 700))
        }
        for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r))
      }, v)
      await page.waitForTimeout(600)
      writeFileSync(
        `${OUT}/${tag}__${v.replace(/[^A-Za-z0-9-]/g, '_')}.png`,
        await page.locator('model-viewer').screenshot(),
      )
    }
    console.log(tag, variants.join(','))
  } catch (e) {
    console.log(tag, 'FAILED', e.message.split('\n')[0])
  }
  await page.close()
}
await browser.close()
