#!/usr/bin/env node
/**
 * Flicker, measured by machine (fix plan Rank 7, 2026-09-03).
 *
 * A z-fight is a depth tie the GPU resolves differently per pixel and per frame the
 * moment the camera moves — which is why "does it flicker?" was a question only a
 * person turning the garment could answer. Two instruments settle it without a person:
 *
 *   1. SAME CAMERA, instruments OFF vs ON. The pixels that change are the ties the
 *      near plane and the depth bias resolve — the specks the customer would see.
 *   2. A 0.05° CAMERA MOVE, OFF and ON. A stable surface changes only by reprojection;
 *      a fighting one changes wherever the tie flips. The OFF−ON gap is the flicker.
 *
 * Runs the same steps the robot does first: `pipeline overlays --out` writes the
 * depth-bias records into a copy, and the renders read that copy. Numbers measured
 * 2026-09-03 across nine processed garments: X-Milo back wordmark 5.61% (1) and
 * 0.47% → 0.11% (2); Minecut graphic 0.52% and 0.22% → 0.00%; every print without a
 * tie ≤ 0.10% on (1). A macro crop of a label reads 15–33% on (2) both ways — that is
 * parallax on a frame-filling label, not flicker; read the OFF−ON gap, never one column.
 *
 * Usage (from tools/asset-pipeline):
 *   npx tsx scripts/flicker-by-machine.mjs <file.glb> --views <views.json> --out <dir> [--variant <name>]
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import sharp from 'sharp'

const args = process.argv.slice(2)
const opt = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const file = args.find((a) => !a.startsWith('--') && a.endsWith('.glb'))
const views = opt('--views')
const out = opt('--out')
const variant = opt('--variant')
if (!file || !views || !out) {
  console.error(
    'usage: flicker-by-machine.mjs <file.glb> --views <views.json> --out <dir> [--variant <name>]',
  )
  process.exit(1)
}
mkdirSync(out, { recursive: true })
const cli = (...a) => {
  const r = spawnSync('npx', ['tsx', 'src/cli.ts', ...a], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) throw new Error(`pipeline ${a[0]} failed:\n${r.stderr || r.stdout}`)
  return r.stdout
}

// 1. The robot's own step: depth-bias records into a copy.
const annotatedDir = join(out, 'annotated')
const summary = cli('overlays', resolve(file), '--out', annotatedDir)
console.log(
  summary
    .split('\n')
    .filter((l) => /measured|REVIEW|STALE/.test(l))
    .join('\n'),
)
const annotated = join(annotatedDir, basename(file))
const glb = existsSync(annotated) ? annotated : resolve(file)

// 2. Every view plus a twin 0.05° further round.
const source = JSON.parse(readFileSync(views, 'utf8')).filter((v) => !/warmup/i.test(v.name))
const twins = []
for (const v of source) {
  twins.push(v)
  const m = String(v.orbit).match(/^(-?[\d.]+)deg (.*)$/)
  if (m) twins.push({ ...v, name: `${v.name}__moved`, orbit: `${Number(m[1]) + 0.05}deg ${m[2]}` })
}
const twinFile = join(out, 'views-twin.json')
writeFileSync(twinFile, JSON.stringify(twins, null, 1))

const render = (mode) => {
  const dir = join(out, `render-${mode}`)
  const extra = mode === 'off' ? ['--no-instruments'] : []
  const v = variant ? ['--variant', variant] : []
  const log = cli('render', glb, '--out', dir, '--views', twinFile, ...v, ...extra)
  for (const line of log.split('\n')) if (/FLAT/.test(line)) console.log(line)
  return dir
}
const off = render('off')
const on = render('on')

const changed = async (a, b) => {
  const A = await sharp(a).raw().toBuffer({ resolveWithObject: true })
  const B = await sharp(b).raw().toBuffer({ resolveWithObject: true })
  const n = A.info.width * A.info.height
  const ch = A.info.channels
  let moved = 0
  for (let i = 0; i < n; i++) {
    let d = 0
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.data[i * ch + c] - B.data[i * ch + c]))
    if (d > 8) moved++
  }
  return (100 * moved) / n
}

console.log('\nview'.padEnd(46), 'OFF→ON same camera', 'OFF 0.05°', 'ON 0.05°', 'flicker (OFF−ON)')
for (const name of readdirSync(on).filter(
  (f) => f.endsWith('.png') && !f.endsWith('__moved.png'),
)) {
  const base = name.replace(/\.png$/, '')
  const same = await changed(join(off, name), join(on, name))
  const movedOff = existsSync(join(off, `${base}__moved.png`))
    ? await changed(join(off, name), join(off, `${base}__moved.png`))
    : NaN
  const movedOn = existsSync(join(on, `${base}__moved.png`))
    ? await changed(join(on, name), join(on, `${base}__moved.png`))
    : NaN
  const gap = movedOff - movedOn
  console.log(
    base.slice(0, 45).padEnd(46),
    `${same.toFixed(2)}%`.padStart(18),
    `${movedOff.toFixed(2)}%`.padStart(9),
    `${movedOn.toFixed(2)}%`.padStart(8),
    `${gap.toFixed(2)}pp`.padStart(16),
    same >= 0.5 || gap >= 0.1 ? '  ← a depth tie the instruments resolve' : '',
  )
}
