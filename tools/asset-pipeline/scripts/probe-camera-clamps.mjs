#!/usr/bin/env node
/**
 * Where does <model-viewer> silently clamp the camera? Ask it, do not assume.
 *
 * The harness has been bitten twice by a camera control that returned a plausible
 * frame of the wrong thing: `min-field-of-view` (2026-08-08, every zoom under 12°
 * ignored) and `max-camera-orbit` (audit HR-5, every pull-back past 105% ignored).
 * This opens the real harness page, requests a list of orbits and zooms, and prints
 * what the element actually settled on — radius, field of view and the near plane —
 * so a clamp is a printed number rather than four identical PNGs found by chance.
 *
 * Usage (from tools/asset-pipeline):
 *   npx tsx scripts/probe-camera-clamps.mjs <file.glb> [--radii 20%,42%,60%,105%,200%] [--fov 1deg,3deg,12deg,45deg] [--no-instruments]
 */
import { chromium } from '@playwright/test'
import { renderHarnessPage, startHarnessServer } from '../src/render.ts'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error(
    'usage: probe-camera-clamps.mjs <file.glb> [--radii a,b,c] [--fov a,b,c] [--no-instruments]',
  )
  process.exit(2)
}
const value = (flag, fallback) => {
  const at = args.indexOf(flag)
  return at >= 0 ? args[at + 1].split(',') : fallback
}
const radii = value('--radii', [
  '20%',
  '30%',
  '42%',
  '50%',
  '60%',
  '80%',
  '105%',
  '200%',
  '500%',
  '0.2m',
  '0.445m',
  '1m',
])
const fovs = value('--fov', ['1deg', '2.7deg', '3.1deg', '14deg', '18deg', '45deg'])
const instruments = !args.includes('--no-instruments')

const { server, port } = await startHarnessServer(
  file,
  renderHarnessPage({ instruments, lighting: 'diagnostic' }),
)
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
})
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } })
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction('window.__ready !== undefined', null, { timeout: 30_000 })
  await page.evaluate('window.__ready')
  const framed = await page.evaluate(
    '(() => { const mv = document.getElementById("mv"); const d = mv.getDimensions(); return { radius: mv.getCameraOrbit().radius, fov: mv.getFieldOfView(), dims: [d.x, d.y, d.z] } })()',
  )
  console.log(
    `${file}\n  framed: radius ${framed.radius.toFixed(4)} m, fov ${framed.fov.toFixed(2)}°, size ${framed.dims.map((n) => n.toFixed(3)).join(' x ')} m\n`,
  )
  console.log('  requested radius   actual radius   ratio to framed   near plane')
  for (const r of radii) {
    const got = await page.evaluate(`(async () => {
      const mv = document.getElementById('mv')
      mv.cameraOrbit = '0deg 78deg ${r}'
      mv.fieldOfView = 'auto'
      mv.jumpCameraToGoal()
      await mv.updateComplete
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const cam = window.__instruments ? window.__instruments.camera() : null
      return { radius: mv.getCameraOrbit().radius, near: cam ? cam.near : null }
    })()`)
    console.log(
      `  ${r.padEnd(16)} ${got.radius.toFixed(4).padStart(14)} m ${(got.radius / framed.radius).toFixed(3).padStart(14)}   ${got.near === null ? '(no instruments)' : got.near.toFixed(4)}`,
    )
  }
  console.log('\n  requested fov   actual fov')
  for (const f of fovs) {
    const got = await page.evaluate(`(async () => {
      const mv = document.getElementById('mv')
      mv.cameraOrbit = '0deg 78deg 105%'
      mv.fieldOfView = '${f}'
      mv.jumpCameraToGoal()
      await mv.updateComplete
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return mv.getFieldOfView()
    })()`)
    console.log(`  ${f.padEnd(14)} ${got.toFixed(3).padStart(10)}°`)
  }
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(() => resolve()))
}
