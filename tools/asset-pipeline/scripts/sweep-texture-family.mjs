#!/usr/bin/env node
/**
 * Sweep candidate texture-family flags on one raw export and report what each cost.
 *
 * WHY A SCRIPT AND NOT A TEST. The output is a picture, and no assertion in this
 * repository can see compression or decimation damage — the three blocking gates
 * test alphaMode, which neither changes (docs/OPEN-ISSUE-ARTWORK.md). This is the
 * same shape as the 2026-08-05 sweep that set `balanced` to 0.001.
 *
 * Usage: node scripts/sweep-texture-family.mjs <raw.glb> <outDir> [onlyCandidate]
 */
import { spawn } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

const [raw, outDir, only] = process.argv.slice(2)
if (!raw || !outDir) {
  console.error('Usage: node scripts/sweep-texture-family.mjs <raw.glb> <outDir> [onlyCandidate]')
  process.exit(1)
}

/**
 * A. Today's flags, unchanged — the control. Every other row is judged against it.
 * B. Drop --simplify; keep everything else. Isolates "does the geometry lever do
 *    anything at all on a file with 9,980 triangles".
 * C. B plus MORE texture headroom — the design's reading of "spend the freed
 *    budget". Expected bigger; the question is whether it is BETTER.
 * D. B plus LESS texture headroom. The opposite reading, and the one the 40 MB
 *    ceiling suggests is actually needed on a file carrying 1 GB of textures.
 * E. D with the artwork exemption widened, so fabric pays and graphics do not.
 */
const CANDIDATES = [
  [
    'A-control',
    [
      '--stitch',
      '0.03',
      '--stitch-error',
      '0.0005',
      '--simplify',
      '0.05',
      '--simplify-error',
      '0.001',
      '--uv-weight',
      '1',
      '--meshopt',
      '--max-texture',
      '4096',
      '--data-max-texture',
      '2048',
      '--quality',
      '75',
    ],
  ],
  [
    'B-nosimplify',
    [
      '--stitch',
      '0.03',
      '--stitch-error',
      '0.0005',
      '--meshopt',
      '--max-texture',
      '4096',
      '--data-max-texture',
      '2048',
      '--quality',
      '75',
    ],
  ],
  [
    'C-morequality',
    [
      '--stitch',
      '0.03',
      '--stitch-error',
      '0.0005',
      '--meshopt',
      '--max-texture',
      '4096',
      '--data-max-texture',
      '2048',
      '--quality',
      '85',
      '--artwork-quality',
      '95',
    ],
  ],
  [
    'D-lessquality',
    [
      '--stitch',
      '0.03',
      '--stitch-error',
      '0.0005',
      '--meshopt',
      '--max-texture',
      '2048',
      '--data-max-texture',
      '1024',
      '--quality',
      '70',
      '--artwork-quality',
      '95',
    ],
  ],
  // ⚠️ E WAS IDENTICAL TO D BY CONSTRUCTION and produced a byte-identical file.
  // `--artwork-max-texture 4096` IS DEFAULT_ARTWORK_MAX_TEXTURE, so it added
  // nothing. Kept as a row rather than deleted, because "these two are the same
  // run" is the finding — a candidate that cannot differ is not a candidate.
  [
    'E-artworkfirst',
    [
      '--stitch',
      '0.03',
      '--stitch-error',
      '0.0005',
      '--meshopt',
      '--max-texture',
      '2048',
      '--data-max-texture',
      '1024',
      '--quality',
      '70',
      '--artwork-max-texture',
      '4096',
      '--artwork-quality',
      '95',
    ],
  ],
  // F. THE ONE THE FIRST FIVE MISSED: today's GEOMETRY flags with D's TEXTURE
  // flags. Added 2026-08-26 after B measured BIGGER than the control on X-MILO
  // (80.2 vs 71.0 MB) — dropping --simplify costs 9 MB on a texture-heavy garment
  // that still carries 2 million triangles, while costing exactly 0.0% on one with
  // 9,980. So the texture fraction is the wrong lever for the geometry decision,
  // and no candidate above tested keeping both.
  [
    'F-both',
    [
      '--stitch',
      '0.03',
      '--stitch-error',
      '0.0005',
      '--simplify',
      '0.05',
      '--simplify-error',
      '0.001',
      '--uv-weight',
      '1',
      '--meshopt',
      '--max-texture',
      '2048',
      '--data-max-texture',
      '1024',
      '--quality',
      '70',
      '--artwork-quality',
      '95',
    ],
  ],
]

const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn('node_modules/.bin/tsx', ['src/cli.ts', ...args], {
      stdio: ['ignore', 'pipe', 'inherit'],
      // The Cycling Bib peaks near 5.27 GB; the default V8 heap here is ~4.09 GB.
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=12288' },
    })
    let out = ''
    child.stdout.on('data', (c) => {
      out += c
    })
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}`))))
  })

const mb = (b) => (b / 1048576).toFixed(1)
await mkdir(outDir, { recursive: true })
const before = (await stat(raw)).size
console.log(`SWEEP  ${basename(raw)}  ${mb(before)} MB\n`)
const rows = []
for (const [name, flags] of CANDIDATES) {
  if (only && name !== only) continue
  const glb = join(outDir, `${name}.glb`)
  const started = Date.now()
  process.stdout.write(`  ${name.padEnd(16)} `)
  try {
    await run(['optimize', raw, '--out', glb, ...flags])
    const after = (await stat(glb)).size
    const secs = (Date.now() - started) / 1000
    rows.push({ name, after, secs })
    console.log(
      `${mb(after).padStart(8)} MB   ${secs.toFixed(1)}s   ${(before / after).toFixed(1)}x smaller`,
    )
  } catch (error) {
    console.log(`FAILED after ${((Date.now() - started) / 1000).toFixed(1)}s — ${error.message}`)
    rows.push({ name, after: null, secs: (Date.now() - started) / 1000 })
  }
}
const control = rows.find((r) => r.name === 'A-control')
if (control?.after) {
  console.log('\n  vs A-control:')
  for (const r of rows) {
    if (r.name === 'A-control' || !r.after) continue
    const delta = ((r.after - control.after) / control.after) * 100
    console.log(`    ${r.name.padEnd(16)} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`)
  }
}
console.log(`\n  Judge them: pnpm pipeline review ${outDir}`)
