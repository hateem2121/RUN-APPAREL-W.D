#!/usr/bin/env tsx
import { mergeVariants, parseMergeArgs, type ParsedMergeArgs } from './merge-variants'
import { checkVariants, inspectGlb } from './validate'
import { generatePlaceholders } from './placeholders'

const USAGE = `RUN APPAREL — GLB asset pipeline

USAGE
  pnpm pipeline merge --out <merged.glb> [--draco] <file.glb>=<VARIANT-ID> [...]
      Merge one raw GLB per colourway into a single production GLB with
      KHR_materials_variants named after CMS variantIds.
      e.g. pnpm pipeline merge --out output/n001.glb \\
             raw/n001-navy.glb=N001-NAVY raw/n001-black.glb=N001-BLACK

  pnpm pipeline validate <file.glb> [--expect ID1,ID2,...]
      Inspect a GLB and (optionally) assert its bound variants exactly match
      the CMS colourway variantId list. Exits non-zero on mismatch.

  pnpm pipeline placeholders [--out <dir>]
      Generate placeholder seed assets (per-colour GLBs + posters) for N001.
`

function fail(message: string): never {
  console.error(`\nERROR: ${message}\n`)
  process.exit(1)
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  if (command === 'merge') {
    const { inputs, out, draco: useDraco } = ((): ParsedMergeArgs => {
      try {
        return parseMergeArgs(rest)
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    })()
    if (!out) fail('Missing --out <merged.glb>')
    const result = await mergeVariants(inputs, out, { draco: useDraco })
    console.log(`Merged ${inputs.length} colourways → ${result.outputFile}`)
    console.log(`  variants:   ${result.variants.join(', ')}`)
    console.log(`  primitives: ${result.primitiveCount}  materials: ${result.materialCount}`)
    console.log(`  size:       ${(result.bytes / 1024).toFixed(1)} KB`)
    console.log('\nNext: run "pnpm pipeline validate" with --expect before uploading to the CMS.')
    return
  }

  if (command === 'validate') {
    const file = rest.find((a) => !a.startsWith('--'))
    if (!file) fail('Missing <file.glb>')
    const expectIdx = rest.indexOf('--expect')
    const expected =
      expectIdx === -1 ? null : (rest[expectIdx + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)

    const report = await inspectGlb(file)
    console.log(`${report.file}`)
    console.log(`  size:       ${(report.bytes / 1024).toFixed(1)} KB`)
    console.log(`  meshes:     ${report.meshCount}  primitives: ${report.primitiveCount}`)
    console.log(`  materials:  ${report.materialCount}  textures: ${report.textureCount}`)
    console.log(`  variants:   ${report.variants.length ? report.variants.join(', ') : '(none bound)'}`)
    for (const warning of report.warnings) console.log(`  WARNING:    ${warning}`)

    if (expected) {
      const check = checkVariants(report, expected)
      if (!check.ok) {
        if (check.missing.length) console.error(`  MISSING variants: ${check.missing.join(', ')}`)
        if (check.extra.length) console.error(`  UNEXPECTED variants: ${check.extra.join(', ')}`)
        fail(
          'availableVariants does not match the CMS variantId list. Do not publish this GLB — ' +
            'fix the merge inputs, or publish the product as "separate-glb-per-colour".',
        )
      }
      console.log('  OK — bound variants exactly match the expected CMS variantIds.')
    }
    return
  }

  if (command === 'placeholders') {
    const outIdx = rest.indexOf('--out')
    const outDir = outIdx === -1 ? 'output/placeholders' : (rest[outIdx + 1] ?? 'output/placeholders')
    const result = await generatePlaceholders(outDir)
    console.log(`Generated ${result.glbFiles.length} GLBs and ${result.posterFiles.length} posters in ${outDir}`)
    return
  }

  console.log(USAGE)
  if (command) fail(`Unknown command "${command}"`)
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})
