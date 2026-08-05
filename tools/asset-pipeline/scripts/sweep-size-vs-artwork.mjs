#!/usr/bin/env node
/**
 * Size vs artwork-survival sweep, from the RAW CLO export.
 *
 * WHY THIS EXISTS. The corrected pipeline produces 37.7 MB where the old broken
 * one produced 19.4 MB, and the difference is not waste — the small file was
 * small BECAUSE it tore the printed logos. This measures where the real floor is
 * instead of guessing, and produces evidence rather than an opinion.
 *
 * TWO RULES IT MUST KEEP.
 *
 *  1. EVERY RUN STARTS FROM THE RAW EXPORT. Meshopt quantizes vertex attributes
 *     and simplify-textured.ts bails to a position-only fallback when it sees
 *     them, so a second pass silently loses artwork protection and blames the
 *     wrong stage. Never sweep by re-processing an output.
 *  2. IT VARIES `--simplify-error`, NOT `--simplify`. From shrink.ts: "ratio is a
 *     target, not a promise — the simplifier stops early when the error budget
 *     binds. Lowering --simplify alone therefore does nothing once the budget is
 *     the binding constraint." A sweep over the ratio would have produced five
 *     near-identical files and read as "nothing helps".
 *
 * Usage: node scripts/sweep-size-vs-artwork.mjs <raw.glb> <outDir>
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { optimizeGlb, parseOptimizeArgs } from '../src/optimize.ts'
import { createIO } from '../src/io.ts'
import { findArtworkAlphaProblems, isArtworkTexture } from '../src/texture-artwork.ts'
import { profileAlpha } from '../src/textures.ts'

const raw = process.argv[2]
const outDir = process.argv[3] ?? 'output/sweep'
if (!raw) {
  console.error('usage: sweep-size-vs-artwork.mjs <raw.glb> [outDir]')
  process.exit(1)
}

/**
 * The three shipped Detail levels plus three probes between and beyond them.
 * `F` is expected to DAMAGE the artwork — a sweep where every run passes has not
 * found the edge, and knowing where the cliff is matters more than another
 * passing row.
 */
const RUNS = [
  { id: 'A', label: 'balanced (shipped)', error: '0.0005', uv: '1', ratio: '0.05' },
  { id: 'B', label: 'fidelity (shipped)', error: '0.0002', uv: '2', ratio: '0.05' },
  { id: 'C', label: 'budget x2', error: '0.001', uv: '1', ratio: '0.05' },
  { id: 'D', label: 'budget x2, uv-weight 2', error: '0.001', uv: '2', ratio: '0.05' },
  { id: 'E', label: 'small (shipped)', error: '0.002', uv: '1', ratio: '0.02' },
  { id: 'F', label: 'budget x10 — expected to fail', error: '0.005', uv: '1', ratio: '0.05' },
]

await mkdir(outDir, { recursive: true })
const io = await createIO()
const rows = []

for (const run of RUNS) {
  const out = join(outDir, `${run.id}.glb`)
  const started = process.hrtime.bigint()
  console.log(`\n── ${run.id} · ${run.label} · error=${run.error} uv=${run.uv} ratio=${run.ratio}`)

  let row
  try {
    // Through the parser, exactly as apps/shrink/container/server.ts does:
    // `opaque` defaults TRUE here and FALSE in optimizeGlb, so a hand-built
    // options object would silently skip solidifyMaterials and make every run
    // look like it failed the alpha gate.
    const { options } = parseOptimizeArgs([
      raw, '--out', out,
      '--simplify', run.ratio,
      '--meshopt',
      '--simplify-error', run.error,
      '--uv-weight', run.uv,
    ])
    const result = await optimizeGlb(raw, out, options)
    const bytes = (await stat(out)).size

    const doc = await io.read(out)
    const alphaProblems = await findArtworkAlphaProblems(doc)

    const artwork = []
    for (const m of doc.getRoot().listMaterials()) {
      const t = m.getBaseColorTexture()
      if (!t || !(await isArtworkTexture(t))) continue
      const img = t.getImage()
      if (!img) continue
      const p = await profileAlpha(img)
      artwork.push({
        name: t.getName(),
        alphaMode: m.getAlphaMode(),
        cutoff: m.getAlphaCutoff(),
        mid: Number((p.midFraction * 100).toFixed(2)),
      })
    }

    row = {
      ...run,
      mb: Number((bytes / 1024 / 1024).toFixed(2)),
      artworkAtRisk: result.simplify?.artworkAtRisk ?? [],
      alphaProblems,
      artworkCount: artwork.length,
      allMasked: artwork.length > 0 && artwork.every((a) => a.alphaMode === 'MASK' && a.cutoff === 0.5),
      artwork,
      // The three blocking gates, as the shrink worker applies them.
      wouldShip: (result.simplify?.artworkAtRisk ?? []).length === 0 && alphaProblems.length === 0,
    }
  } catch (err) {
    // A run that THROWS is a result, not an error: the pipeline refusing to save
    // is exactly the outcome this sweep is looking for at the aggressive end.
    row = { ...run, refused: String(err?.message ?? err), wouldShip: false }
  }

  row.seconds = Number((Number(process.hrtime.bigint() - started) / 1e9).toFixed(1))
  rows.push(row)
  console.log(
    row.refused
      ? `   REFUSED after ${row.seconds}s — ${row.refused.slice(0, 160)}`
      : `   ${row.mb} MB · ${row.seconds}s · artwork=${row.artworkCount} allMASK=${row.allMasked} wouldShip=${row.wouldShip}`,
  )
}

await writeFile(join(outDir, 'sweep.json'), JSON.stringify(rows, null, 2))

console.log('\n\n| run | setting | MB | artwork | all MASK/0.5 | ships? |')
console.log('|---|---|---|---|---|---|')
for (const r of rows) {
  console.log(
    `| ${r.id} | ${r.label} (err ${r.error}, uv ${r.uv}) | ${r.refused ? '—' : r.mb} | ${r.artworkCount ?? '—'} | ${r.refused ? 'refused' : r.allMasked} | ${r.wouldShip ? 'yes' : 'NO'} |`,
  )
}
const shippable = rows.filter((r) => r.wouldShip)
const best = shippable.sort((a, b) => a.mb - b.mb)[0]
console.log(
  best
    ? `\nSmallest file that passes all three gates: ${best.id} at ${best.mb} MB (${best.label}).`
    : '\nNo run passed all three gates.',
)
console.log(`Wrote ${join(outDir, 'sweep.json')}`)
