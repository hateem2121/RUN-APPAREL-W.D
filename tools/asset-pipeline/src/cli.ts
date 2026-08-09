#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises'
import { compareRenders } from './compare'
import { mergeVariants, parseMergeArgs, type ParsedMergeArgs } from './merge-variants'
import { optimizeGlb, parseOptimizeArgs } from './optimize'
import { DEFAULT_VIEWS, type RenderView, renderViews } from './render'
import { dumpTextures } from './textures'
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

DIAGNOSTICS — for looking at artwork instead of guessing at it
  pnpm pipeline textures <file.glb> --out <dir> [--no-images]
      Dump every texture to PNG with a manifest.json saying which materials and
      slots use it, WHICH UV SET it samples, and what its alpha channel really
      contains. Answers "is the artwork on TEXCOORD_1?" and "did the encoder
      crush it?" without processing the file at all. Start here.

  pnpm pipeline render <file.glb> --out <dir> [flags]
      Screenshot the GLB through <model-viewer>, from fixed camera angles,
      including tight crops where printed logos live. Flat neutral lighting and
      shadows off, so a diff shows the artwork rather than the lighting.
      --views <file.json>  Camera list: [{ "name", "orbit", "target"?, "fieldOfView"? }]
      --variant <name>     Select a KHR_materials_variants colourway first
      --size <px>          Square render size (default 1024)

  pnpm pipeline compare <dirA> <dirB> --out <sheet.png> [--gain <n>]
      Contact sheet of two render directories: A, B and their amplified
      difference, per view, with the real numbers in each row's label.

COMPRESSION FLAGS (merge, optimize)
  --no-webp            Keep original texture formats (default: re-encode to WebP)
  --ktx2               KTX2 / Basis Universal textures (ETC1S colour + UASTC
                       normal maps) — smallest GPU footprint, the production
                       target; model-viewer v4.3+ decodes it natively
  --max-texture <px>   Cap texture width/height, aspect preserved (default: 2048)
  --quality <n>        WebP quality 1-100 / KTX2 ETC1S quality 1-255 (default: 82)
  --artwork-quality <n>      WebP quality for textures carrying printed artwork
                             (default: 95). Artwork is DETECTED, not declared —
                             by alpha cutout, extreme aspect ratio, or name.
                             Lossy WebP is 4:2:0 chroma only, which bleeds the
                             hard saturated edges logos are made of, so these
                             get their own setting. Costs almost nothing:
                             textures are ~2 MB of a ~19 MB garment
  --artwork-max-texture <px> Cap for artwork textures (default: 4096). Higher
                             than --max-texture: thin lettering is the first
                             thing resampling destroys
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
  (default)            Resolve each translucent material by INSPECTING its alpha,
                       not by blanket rule:
                         no/solid alpha  -> OPAQUE + double-sided (CLO's stray
                                            fabric opacity, the see-through bug)
                         hard cutout     -> MASK alphaCutoff 0.5, NOT double-
                                            sided (a printed decal — forcing it
                                            opaque would fill the cutout in)
                         graded alpha    -> left BLEND (genuinely sheer fabric)
  --keep-transparency  Skip the step entirely. Note this is NOT the fix for
                       damaged artwork: <model-viewer> has no order-independent
                       transparency, so BLEND on a multi-part garment just trades
                       one "half visible" for depth-sorting artefacts.
                       Alias: --no-opaque
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
    fail(
      `Could not reach the CMS at ${base}: ${error instanceof Error ? error.message : String(error)}`,
    )
  })

  if (res.status === 401)
    fail(`The CMS rejected CMS_API_KEY. Check the key belongs to an admin or editor user.`)
  if (res.status === 404) fail(`No product at ${base} has the web address word "${productSlug}".`)
  if (!res.ok) fail(`The CMS returned ${res.status} for ${url}.`)

  const plan = (await res.json()) as CmsPlan
  if (!plan?.variantIds?.length) {
    fail(
      `Product "${productSlug}" has no colours switched on in the CMS, so there is nothing to merge.\n` +
        "  Add them on the product's Colours tab first.",
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
    const textureLabel =
      options.texture === 'webp' ? 'WebP' : options.texture === 'ktx2' ? 'KTX2' : 'unchanged'
    console.log(`  textures:   ${textureLabel}  geometry: ${options.geometry}`)
    console.log(
      `  materials:  ${options.opaque === false ? 'transparency kept (--keep-transparency)' : 'forced opaque + double-sided'}`,
    )
    console.log(`  size:       ${(result.bytes / 1024).toFixed(1)} KB`)
    console.log('\nNext: run "pnpm pipeline validate" with --expect before uploading to the CMS.')
    return
  }

  if (command === 'optimize') {
    const { input, out, options } = parseOptimizeArgs(rest)
    if (!input) fail('Missing <file.glb>')
    if (!out) fail('Missing --out <out.glb>')
    const result = await optimizeGlb(input, out, options)
    const pct =
      result.bytesBefore > 0 ? (100 * (1 - result.bytesAfter / result.bytesBefore)).toFixed(1) : '0'
    console.log(`Optimised ${input} → ${result.outputFile}`)
    const simplifyLabel = options.simplify
      ? `  simplify: keep ${Math.round(options.simplify * 100)}% of triangles`
      : ''
    console.log(
      `  textures:   ${result.textureCount} (${result.textureFormats.join(', ') || 'none'})  geometry: ${result.geometry}${simplifyLabel}`,
    )
    if (result.solidify) {
      const { opaqued, masked, keptBlend, doubleSided } = result.solidify
      console.log(
        `  materials:  ${opaqued} → OPAQUE, ${masked} → MASK (cutout kept), ${keptBlend} left BLEND (sheer), ${doubleSided} double-sided`,
      )
    } else {
      console.log('  materials:  transparency kept (--keep-transparency)')
    }
    if (result.textures) {
      const { artwork, standard, skipped } = result.textures
      console.log(
        `  encoding:   ${artwork} artwork texture(s) at high fidelity, ${standard} standard, ${skipped} untouched`,
      )
      if (artwork > 0)
        console.log(`              artwork: ${result.textures.artworkNames.join(', ')}`)
    }
    if (result.simplify) {
      const { attributeAware, fallback, skipped, uvSetsWeighted } = result.simplify
      console.log(
        `  decimation: ${attributeAware} primitive(s) with UV error in the budget, ${fallback} fallback, ${skipped} skipped`,
      )
      console.log(
        `  UV sets:    ${uvSetsWeighted.map((n) => `TEXCOORD_${n}`).join(', ') || 'none'} weighted against the error budget`,
      )
      // Without this line a --uv-weight that was never applied is invisible.
      if (fallback > attributeAware) {
        console.log(
          `  WARNING:    most primitives took the position-only fallback, so --uv-weight did NOT protect them.`,
        )
      }
    }
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
      expectIdx === -1
        ? null
        : (rest[expectIdx + 1] ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)

    const strict = rest.includes('--strict')

    const report = await inspectGlb(file)
    console.log(`${report.file}`)
    console.log(`  size:       ${(report.bytes / 1024).toFixed(1)} KB`)
    console.log(`  generator:  ${report.generator || '(none)'}`)
    console.log(`  meshes:     ${report.meshCount}  primitives: ${report.primitiveCount}`)
    console.log(
      `  materials:  ${report.materialCount}  textures: ${report.textureCount} (${report.uncompressedTextureCount} raw PNG/JPEG)`,
    )
    console.log(`  translucent: ${report.translucentMaterialCount} material(s) alphaMode BLEND`)
    console.log(
      `  alphaModes: ${
        Object.entries(report.alphaModeCounts)
          .map(([mode, n]) => `${n} ${mode}`)
          .join(', ') || '(none)'
      }`,
    )
    console.log(
      `  UV sets:    ${report.texCoordsInUse.map((n) => `TEXCOORD_${n}`).join(', ') || '(no textured materials)'}`,
    )
    console.log(
      `  variants:   ${report.variants.length ? report.variants.join(', ') : '(none bound)'}`,
    )
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

  if (command === 'textures') {
    const positional: string[] = []
    let outDir: string | null = null
    let images = true
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!
      if (arg === '--out') outDir = rest[++i] ?? null
      else if (arg === '--no-images') images = false
      else if (!arg.startsWith('--')) positional.push(arg)
    }
    const file = positional[0]
    if (!file) fail('Missing <file.glb>')
    if (!outDir) fail('Missing --out <dir>')

    const inventory = await dumpTextures(file, outDir, { images })
    console.log(`${file} → ${outDir}`)
    console.log(`  textures:   ${inventory.textures.length}`)
    console.log(
      `  UV sets:    ${inventory.texCoordsInUse.map((n) => `TEXCOORD_${n}`).join(', ') || '(none sampled)'}`,
    )
    console.log(
      `  materials:  ${
        Object.entries(inventory.alphaModeCounts)
          .map(([mode, n]) => `${n} ${mode}`)
          .join(', ') || '(none)'
      }`,
    )
    console.log('')
    for (const texture of inventory.textures) {
      const size = texture.width && texture.height ? `${texture.width}x${texture.height}` : '?'
      const uv = texture.texCoords.map((n) => `UV${n}`).join('/') || 'UV?'
      console.log(
        `  #${String(texture.index).padStart(3)}  ${size.padEnd(11)} ${(texture.mimeType || '?').padEnd(11)} ` +
          `${(`${(texture.bytes / 1024).toFixed(1)} KB`).padStart(10)}  ${String(texture.bytesPerPixel ?? '?').padStart(7)} bpp  ` +
          `${uv.padEnd(7)} alpha:${texture.alpha.character.padEnd(7)} ${texture.slots.join(',') || '(unused)'}`,
      )
    }
    if (inventory.warnings.length) console.log('')
    for (const warning of inventory.warnings) console.log(`  WARNING:    ${warning}`)
    console.log(`\nWrote ${outDir}/manifest.json`)
    return
  }

  if (command === 'render') {
    const positional: string[] = []
    let outDir: string | null = null
    let viewsFile: string | null = null
    let variant: string | null = null
    let dimension: number | undefined
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!
      if (arg === '--out') outDir = rest[++i] ?? null
      else if (arg === '--views') viewsFile = rest[++i] ?? null
      else if (arg === '--variant') variant = rest[++i] ?? null
      else if (arg === '--size') dimension = Number(rest[++i])
      else if (!arg.startsWith('--')) positional.push(arg)
    }
    const file = positional[0]
    if (!file) fail('Missing <file.glb>')
    if (!outDir) fail('Missing --out <dir>')

    const views = viewsFile
      ? (JSON.parse(await readFile(viewsFile, 'utf8')) as RenderView[])
      : DEFAULT_VIEWS
    const result = await renderViews(file, outDir, {
      views,
      variant,
      ...(dimension ? { width: dimension, height: dimension } : {}),
    })
    console.log(`Rendered ${result.files.length} view(s) of ${file} → ${outDir}`)
    console.log(`  views:      ${result.files.join(', ')}`)
    console.log(`  variants:   ${result.availableVariants.join(', ') || '(none bound)'}`)
    console.log('\nNext: "pnpm pipeline compare <thisDir> <otherDir> --out sheet.png".')
    return
  }

  if (command === 'compare') {
    // Scan once so a flag's value can never be mistaken for a positional — and
    // nor can a positional be swallowed when an optional flag is absent.
    const positional: string[] = []
    let out: string | null = null
    let gain: number | undefined
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!
      if (arg === '--out') out = rest[++i] ?? null
      else if (arg === '--gain') gain = Number(rest[++i])
      else if (!arg.startsWith('--')) positional.push(arg)
    }
    const [dirA, dirB] = positional
    if (!dirA || !dirB) fail('Usage: compare <dirA> <dirB> --out <sheet.png>')
    if (!out) fail('Missing --out <sheet.png>')

    const result = await compareRenders(dirA, dirB, out, gain ? { gain } : {})
    console.log(`Contact sheet → ${result.outFile}`)
    for (const diff of result.diffs) {
      console.log(
        `  ${diff.view.padEnd(14)} mean ${String(diff.meanDelta).padStart(6)}  max ${String(diff.maxDelta).padStart(3)}  ` +
          `changed ${(diff.changedFraction * 100).toFixed(2)}%`,
      )
    }
    if (result.unmatched.length) {
      console.log(
        `  WARNING:    only in one directory: ${result.unmatched.join(', ')} — did a render fail partway?`,
      )
    }
    return
  }

  if (command === 'placeholders') {
    const outIdx = rest.indexOf('--out')
    const outDir =
      outIdx === -1 ? 'output/placeholders' : (rest[outIdx + 1] ?? 'output/placeholders')
    const result = await generatePlaceholders(outDir)
    console.log(
      `Generated ${result.glbFiles.length} GLBs and ${result.posterFiles.length} posters in ${outDir}`,
    )
    return
  }

  console.log(USAGE)
  if (command) fail(`Unknown command "${command}"`)
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})
