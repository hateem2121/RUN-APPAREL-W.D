#!/usr/bin/env tsx
import { mergeVariants, parseMergeArgs, type ParsedMergeArgs } from './merge-variants'
import { optimizeGlb, parseOptimizeArgs } from './optimize'
import { checkVariants, inspectGlb } from './validate'
import { generatePlaceholders } from './placeholders'

const USAGE = `RUN APPAREL — GLB asset pipeline

USAGE
  pnpm pipeline merge --from-cms <product-slug> --out <merged.glb> [flags] <file.glb> [...]
      Merge one raw GLB per colour into a single production GLB. The variant
      names come from the CMS, so nothing has to be named inside CLO 3D and no
      IDs are typed here. List the files in the SAME ORDER as that product's
      colours.
      e.g. pnpm pipeline merge --from-cms n001 --out output/n001.glb \\
             raw/navy.glb raw/black.glb raw/crimson.glb
      Needs CMS_API_KEY (an editor API key). CMS_URL defaults to
      https://cms.wear-run.help.

  pnpm pipeline merge --out <merged.glb> [flags] <file.glb>=<VARIANT-ID> [...]
      The same thing with the names given explicitly. Still supported for
      scripts and offline use.
      e.g. pnpm pipeline merge --out output/n001.glb \\
             raw/n001-navy.glb=N001-NAVY raw/n001-black.glb=N001-BLACK

  pnpm pipeline optimize <file.glb> --out <out.glb> [flags]
      Compress a single production GLB (e.g. a separate-glb-per-colour export).
      Same compression policy as merge.

  pnpm pipeline validate <file.glb> [--expect ID1,ID2,...]
      Inspect a GLB and (optionally) assert its bound variants exactly match
      the CMS colourway variantId list. Exits non-zero on mismatch.

  pnpm pipeline placeholders [--out <dir>]
      Generate placeholder seed assets (per-colour GLBs + posters) for N001.

COMPRESSION FLAGS (merge, optimize)
  --no-webp            Keep original texture formats (default: re-encode to WebP)
  --ktx2               KTX2 / Basis Universal textures (ETC1S colour + UASTC
                       normal maps) — smallest GPU footprint, the production
                       target; model-viewer v4.3+ decodes it natively
  --max-texture <px>   Cap texture width/height, aspect preserved (default: 2048)
  --quality <n>        WebP quality 1-100 / KTX2 ETC1S quality 1-255 (default: 82)
  --meshopt            Meshopt geometry compression (fast mobile decode)
  --draco              Draco geometry compression (smallest, slower decode)
  --simplify <ratio>   Decimate geometry to this fraction of triangles (0-1),
                       e.g. 0.05 keeps ~5%. ESSENTIAL for raw CLO exports, whose
                       simulation meshes have millions of triangles — the mesh,
                       not the textures, is usually what makes them huge.
                       A TARGET, not a promise: decimation stops early when the
                       error budget below binds, and once it does, lowering this
                       further changes nothing — raise --simplify-error instead
  --simplify-error <r> Error budget as a fraction of mesh radius (default 0.0001)
  --uv-weight <n>      How heavily UV distortion counts against that budget
                       (default 1). This is what keeps printed logos and graphics
                       intact; lower it for a smaller file, raise it if artwork
                       looks smeared. 0 disables texture-aware decimation
  --normal-weight <n>  Same for vertex normals — protects shading (default 0.5)

MATERIAL FLAGS (merge, optimize)
  (default)            Force fabric solid: alphaMode BLEND -> OPAQUE + double-
                       sided. Fixes CLO exports that render see-through in
                       <model-viewer> (which has no order-independent transparency)
  --keep-transparency  Leave transparency untouched — ONLY for genuinely sheer
                       garments (mesh, lace, tulle). Alias: --no-opaque
`

function fail(message: string): never {
  console.error(`\nERROR: ${message}\n`)
  process.exit(1)
}

interface CmsPlan {
  productCode: string
  colours: { displayName: string; slug: string; variantId: string }[]
  variantIds: string[]
}

/**
 * Fetch a product's colour plan from the CMS.
 *
 * The CMS is the only place that knows what a product's colours are, so it is
 * what names the variants — rather than the operator retyping IDs at a terminal
 * and hoping they match, which is precisely how colour buttons used to end up
 * dead on the live page.
 */
async function fetchCmsPlan(productSlug: string): Promise<CmsPlan> {
  const base = (process.env.CMS_URL ?? 'https://cms.wear-run.help').replace(/\/$/, '')
  const apiKey = process.env.CMS_API_KEY
  if (!apiKey) {
    fail(
      'CMS_API_KEY is not set, so --from-cms cannot read the colour names.\n' +
        '  Create an API key on an editor user in the CMS, then:\n' +
        '    export CMS_API_KEY=...\n' +
        '  (Set CMS_URL too if you are not pointing at https://cms.wear-run.help.)',
    )
  }

  const url = `${base}/api/pipeline/plan/${encodeURIComponent(productSlug)}`
  const res = await fetch(url, {
    headers: { Authorization: `users API-Key ${apiKey}`, accept: 'application/json' },
  }).catch((error: unknown) => {
    fail(`Could not reach the CMS at ${base}: ${error instanceof Error ? error.message : String(error)}`)
  })

  if (res.status === 401) fail(`The CMS rejected CMS_API_KEY. Check the key belongs to an admin or editor user.`)
  if (res.status === 404) fail(`No product at ${base} has the web address word "${productSlug}".`)
  if (!res.ok) fail(`The CMS returned ${res.status} for ${url}.`)

  const plan = (await res.json()) as CmsPlan
  if (!plan?.variantIds?.length) {
    fail(
      `Product "${productSlug}" has no colours switched on in the CMS, so there is nothing to merge.\n` +
        '  Add them on the product\'s Colours tab first.',
    )
  }
  return plan
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  if (command === 'merge') {
    const { inputs, out, fromCms, options } = ((): ParsedMergeArgs => {
      try {
        return parseMergeArgs(rest)
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    })()
    if (!out) fail('Missing --out <merged.glb>')

    if (fromCms) {
      const plan = await fetchCmsPlan(fromCms)
      if (plan.variantIds.length !== inputs.length) {
        const names = plan.colours.map((c) => c.displayName).join(', ')
        fail(
          `You gave ${inputs.length} file(s) but "${fromCms}" has ${plan.variantIds.length} colour(s) switched on: ${names}.\n` +
            '  Give one file per colour, in that order — or switch the extra colours off in the CMS.',
        )
      }
      // Positional: file N is colour N. Any name already given on the command
      // line wins, so a half-specified command stays predictable.
      inputs.forEach((input, index) => {
        if (!input.variantName) input.variantName = plan.variantIds[index]!
      })
      console.log(`Naming variants from the CMS (${fromCms}):`)
      plan.colours.forEach((colour, index) => {
        console.log(`  ${inputs[index]!.file}  →  ${colour.displayName} (${colour.variantId})`)
      })
      console.log('')
    }

    const result = await mergeVariants(inputs, out, options)
    console.log(`Merged ${inputs.length} colourways → ${result.outputFile}`)
    console.log(`  variants:   ${result.variants.join(', ')}`)
    console.log(`  primitives: ${result.primitiveCount}  materials: ${result.materialCount}`)
    const textureLabel = options.texture === 'webp' ? 'WebP' : options.texture === 'ktx2' ? 'KTX2' : 'unchanged'
    console.log(`  textures:   ${textureLabel}  geometry: ${options.geometry}`)
    console.log(`  materials:  ${options.opaque === false ? 'transparency kept (--keep-transparency)' : 'forced opaque + double-sided'}`)
    console.log(`  size:       ${(result.bytes / 1024).toFixed(1)} KB`)
    console.log('\nNext: run "pnpm pipeline validate" with --expect before uploading to the CMS.')
    return
  }

  if (command === 'optimize') {
    const { input, out, options } = parseOptimizeArgs(rest)
    if (!input) fail('Missing <file.glb>')
    if (!out) fail('Missing --out <out.glb>')
    const result = await optimizeGlb(input, out, options)
    const pct = result.bytesBefore > 0 ? (100 * (1 - result.bytesAfter / result.bytesBefore)).toFixed(1) : '0'
    console.log(`Optimised ${input} → ${result.outputFile}`)
    const simplifyLabel = options.simplify ? `  simplify: keep ${Math.round(options.simplify * 100)}% of triangles` : ''
    console.log(`  textures:   ${result.textureCount} (${result.textureFormats.join(', ') || 'none'})  geometry: ${result.geometry}${simplifyLabel}`)
    console.log(`  materials:  ${result.opaque ? 'forced opaque + double-sided' : 'transparency kept (--keep-transparency)'}`)
    console.log(
      `  size:       ${(result.bytesBefore / 1024).toFixed(1)} KB → ${(result.bytesAfter / 1024).toFixed(1)} KB  (−${pct}%)`,
    )
    console.log('\nNext: run "pnpm pipeline validate" with --expect before uploading to the CMS.')
    return
  }

  if (command === 'validate') {
    const file = rest.find((a) => !a.startsWith('--'))
    if (!file) fail('Missing <file.glb>')
    const expectIdx = rest.indexOf('--expect')
    const expected =
      expectIdx === -1 ? null : (rest[expectIdx + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)

    const strict = rest.includes('--strict')

    const report = await inspectGlb(file)
    console.log(`${report.file}`)
    console.log(`  size:       ${(report.bytes / 1024).toFixed(1)} KB`)
    console.log(`  generator:  ${report.generator || '(none)'}`)
    console.log(`  meshes:     ${report.meshCount}  primitives: ${report.primitiveCount}`)
    console.log(`  materials:  ${report.materialCount}  textures: ${report.textureCount} (${report.uncompressedTextureCount} raw PNG/JPEG)`)
    console.log(`  translucent: ${report.translucentMaterialCount} material(s) alphaMode BLEND`)
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

    // --strict turns warnings into a hard failure — for CI gating on publish-readiness.
    if (strict && report.warnings.length > 0) {
      fail(`${report.warnings.length} warning(s) with --strict. This GLB is not publish-ready.`)
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
