#!/usr/bin/env node
/**
 * Find the pipeline stage that damages printed artwork.
 *
 * USAGE
 *   node scripts/bisect-artwork.mjs <raw.glb> [--out <dir>] [--detail small|balanced|fidelity]
 *                                   [--variant <name>] [--size <px>] [--only <run,run>]
 *
 * WHY SUBTRACTIVE. The obvious experiment is to vary one setting at a time and
 * see which output looks best. That answers "which knob helps", which is not the
 * question — it has been asked twice already and produced a preset that protects
 * artwork LESS while looking better on the size chart. The question is "which
 * stage does the damage", and the way to answer it is to run the real production
 * chain with exactly one stage removed. If the artwork comes back when a stage
 * is dropped, that stage is the culprit. If it never comes back, the damage is
 * spread across several, and that is worth knowing too.
 *
 * WHY ALWAYS FROM THE RAW FILE. Every run starts from the original export, never
 * from another run's output. Re-processing an already-optimised GLB is a trap
 * this project has fallen into twice: meshopt quantizes vertex attributes to
 * integers, and simplify-textured.ts explicitly bails to the position-only
 * fallback when it sees them (see its Float32Array check), so a second pass
 * silently loses the artwork protection and blames the wrong stage.
 *
 * The `raw` run is the ground truth: no processing at all, just rendered. Every
 * contact sheet is that versus one processed run, so "how far from the original"
 * is directly comparable across rows.
 *
 * Needs PLAYWRIGHT_CHROMIUM_PATH pointing at a Chromium if Playwright's own
 * download is not present (CI images and dev containers usually have one).
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = resolve(here, '..', 'src', 'cli.ts')

/**
 * Flags per detail level, mirroring shrinkFlagsFor() in @run-apparel/shared.
 * Duplicated rather than imported because this is a plain node script run from a
 * checkout, and the point is to reproduce what the shrink container did to a
 * specific upload — so it has to be possible to edit these to match a job that
 * has already run.
 */
const DETAIL_FLAGS = {
  fidelity: ['--simplify', '0.05', '--meshopt', '--simplify-error', '0.0002', '--uv-weight', '2'],
  balanced: ['--simplify', '0.05', '--meshopt', '--simplify-error', '0.0005', '--uv-weight', '1'],
  small: ['--simplify', '0.02', '--meshopt', '--simplify-error', '0.002', '--uv-weight', '1'],
}

/**
 * Each run is the FULL chain minus one stage. `drop` names the flags to remove
 * from the detail preset; `add` names flags to append.
 *
 * `no-solidify` is the odd one out: it is a diagnostic, NOT a candidate fix.
 * <model-viewer> has no order-independent transparency, so leaving materials on
 * alphaMode BLEND trades damaged artwork for sorting artefacts on a multi-part
 * garment. If this run is the one that restores the artwork, the fix is
 * BLEND -> MASK per material, not --keep-transparency. See docs/OPEN-ISSUE-ARTWORK.md.
 */
const RUNS = [
  { name: 'raw', skipOptimize: true, isolates: 'ground truth — no processing at all' },
  { name: 'full', drop: [], add: [], isolates: 'the reported failure, reproduced' },
  { name: 'no-textures', drop: [], add: ['--no-webp'], isolates: 'H5 — lossy WebP is 4:2:0 chroma only' },
  { name: 'no-simplify', drop: ['--simplify', '--simplify-error', '--uv-weight'], add: [], isolates: 'H1/H4 — decimation and UV weighting' },
  { name: 'no-meshopt', drop: ['--meshopt'], add: [], isolates: 'H6 — position quantization' },
  { name: 'no-solidify', drop: [], add: ['--keep-transparency'], isolates: 'H3/H6 — alpha handling (diagnostic only)' },
]

function parseArgs(argv) {
  const positional = []
  const options = { out: 'output/bisect', detail: 'small', variant: null, size: null, only: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out') options.out = argv[++i]
    else if (arg === '--detail') options.detail = argv[++i]
    else if (arg === '--variant') options.variant = argv[++i]
    else if (arg === '--size') options.size = argv[++i]
    else if (arg === '--only') options.only = argv[++i].split(',').map((s) => s.trim())
    else if (!arg.startsWith('--')) positional.push(arg)
  }
  return { raw: positional[0], options }
}

/** Remove a flag and its value from a preset. */
function dropFlags(flags, drop) {
  const out = []
  for (let i = 0; i < flags.length; i++) {
    if (drop.includes(flags[i])) {
      // Every flag this script drops takes a value, except --meshopt.
      if (flags[i] !== '--meshopt') i++
      continue
    }
    out.push(flags[i])
  }
  return out
}

/**
 * Read `asset.generator` straight from the GLB's JSON chunk — the same trick
 * validate.ts uses, and for the same reason: gltf-transform's reader overwrites
 * it on import, hiding exactly the raw-CLO string we are looking for.
 */
async function readGenerator(file) {
  try {
    const buffer = await readFile(file)
    if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) return ''
    const jsonLength = buffer.readUInt32LE(12)
    if (buffer.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > buffer.length) return ''
    const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength))
    return typeof json?.asset?.generator === 'string' ? json.asset.generator : ''
  } catch {
    return ''
  }
}

function run(args, label) {
  return new Promise((resolvePromise, reject) => {
    console.log(`\n$ tsx cli.ts ${args.join(' ')}`)
    const child = spawn('npx', ['tsx', cli, ...args], { stdio: 'inherit', cwd: resolve(here, '..') })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${label} failed with exit code ${code}`))
    })
  })
}

async function main() {
  const { raw, options } = parseArgs(process.argv.slice(2))
  if (!raw) {
    console.error('Usage: node scripts/bisect-artwork.mjs <raw.glb> [--out <dir>] [--detail small|balanced|fidelity]')
    process.exit(1)
  }
  const preset = DETAIL_FLAGS[options.detail]
  if (!preset) {
    console.error(`Unknown --detail "${options.detail}". Use one of: ${Object.keys(DETAIL_FLAGS).join(', ')}`)
    process.exit(1)
  }

  const outDir = resolve(options.out)
  await mkdir(outDir, { recursive: true })
  const selected = RUNS.filter((r) => !options.only || options.only.includes(r.name))
  if (!selected.some((r) => r.name === 'raw')) {
    console.error('The "raw" run is the baseline every sheet compares against; it cannot be skipped.')
    process.exit(1)
  }

  // Refuse to quietly bisect an already-processed file.
  //
  // The entire premise here is "always from the raw export", and handing this an
  // optimised GLB is the easiest mistake to make — the output of a previous run
  // is sitting right there in the same directory. It is also silently
  // misleading: meshopt quantizes vertex attributes to integers, simplify-
  // textured.ts bails to the position-only fallback when it sees them, and every
  // run then reports artwork damage that the pipeline did not cause. This trap
  // cost two sessions before anyone noticed.
  const generator = await readGenerator(raw)
  if (!/\bCLO\b/i.test(generator)) {
    console.error(
      `\nWARNING: "${raw}" reports generator "${generator || '(none)'}", which does not look like a\n` +
        'raw CLO export. If this is pipeline output, every result below is meaningless:\n' +
        'its attributes are already quantized, so decimation cannot protect artwork and\n' +
        'each run will blame the wrong stage.\n' +
        'Pull the original from the ingest bucket instead. Continuing in 5 seconds...\n',
    )
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 5000))
  }

  // Texture inventory of the raw file first. It is the cheapest step by a wide
  // margin and can settle the UV-set question before a single byte is processed.
  console.log('\n=== Texture inventory of the raw file ===')
  await run(['textures', raw, '--out', join(outDir, 'textures-raw')], 'textures')

  const renderFlags = [
    ...(options.variant ? ['--variant', options.variant] : []),
    ...(options.size ? ['--size', options.size] : []),
  ]

  const done = []
  for (const spec of selected) {
    console.log(`\n=== ${spec.name} — ${spec.isolates} ===`)
    const glb = spec.skipOptimize ? raw : join(outDir, `${spec.name}.glb`)
    if (!spec.skipOptimize) {
      // ALWAYS from `raw`. Never from another run's output — see the header.
      await run(['optimize', raw, '--out', glb, ...dropFlags(preset, spec.drop), ...spec.add], spec.name)
    }
    await run(['render', glb, '--out', join(outDir, spec.name), ...renderFlags], `render ${spec.name}`)
    done.push(spec)
  }

  console.log('\n=== Contact sheets (each run vs. the raw ground truth) ===')
  for (const spec of done) {
    if (spec.name === 'raw') continue
    await run(
      ['compare', join(outDir, 'raw'), join(outDir, spec.name), '--out', join(outDir, `sheet-${spec.name}.png`)],
      `compare ${spec.name}`,
    )
  }

  await writeFile(
    join(outDir, 'README.md'),
    [
      '# Artwork bisect',
      '',
      `Raw file: \`${raw}\``,
      `Detail preset: \`${options.detail}\` → \`${preset.join(' ')}\``,
      '',
      'Each run is the full production chain with ONE stage removed, always starting',
      'from the raw file. Every sheet compares that run against `raw/`, which is the',
      'unprocessed ground truth.',
      '',
      '| Run | Isolates | Sheet |',
      '| --- | --- | --- |',
      ...done.map((s) =>
        s.name === 'raw'
          ? `| \`${s.name}\` | ${s.isolates} | — |`
          : `| \`${s.name}\` | ${s.isolates} | \`sheet-${s.name}.png\` |`,
      ),
      '',
      '## How to read this',
      '',
      'Open each `sheet-*.png` and look at the `crop-*` rows, which are the tight',
      'shots where printed graphics live. The run whose crops match `raw` is the one',
      'whose removed stage was doing the damage.',
      '',
      'The numbers on each row are the unamplified truth; the third column is the',
      'difference multiplied up so it is visible. A whole-garment row lighting up',
      'while its crops stay clean usually means the silhouette moved (decimation',
      'changing the outline), not that the artwork is damaged.',
      '',
      '`no-solidify` is a diagnostic, not a proposed fix: `<model-viewer>` has no',
      'order-independent transparency, so shipping `--keep-transparency` trades',
      'damaged artwork for sorting artefacts. If that run is the one that comes back',
      'clean, the fix is BLEND → MASK per material. See `docs/OPEN-ISSUE-ARTWORK.md`.',
      '',
      'Also read `textures-raw/manifest.json`: if any `texCoords` entry is not `[0]`,',
      'that artwork was never protected by decimation at all, whatever the sheets say.',
      '',
    ].join('\n'),
  )

  console.log(`\nDone. Sheets and a README are in ${outDir}`)
  console.log('Open the sheet-*.png files and look at the crop-* rows.')
}

main().catch((error) => {
  console.error(`\nERROR: ${error.message}\n`)
  process.exit(1)
})
