#!/usr/bin/env tsx
import { attributeBytes, formatAttributeBytes, formatVram, summariseVram } from './attribute-bytes'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { compareRenders } from './compare'
import { type GlbDescription, describeGlb, readGltfJson } from './describe'
import { mergeVariants, parseMergeArgs, type ParsedMergeArgs } from './merge-variants'
import { finiteNumber, optimizeGlb, parseOptimizeArgs } from './optimize'
import type { LightingMode } from './viewer-page'
import { DEFAULT_VIEWS, type RenderView, renderViews } from './render'
import { type SpecFileCheck, checkGltfSpecFileGuarded, describeSpecIssues } from './gltf-spec'
import { annotateGlbOverlays, type OverlayOverride } from './overlay-annotate'
import { measureOverlays } from './overlay-depth'
import { startReviewServer } from './review-server'
import { dumpTextures } from './textures'
import { readGlb } from './io'
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
  pnpm pipeline describe <file.glb> [...] [--json]
      Read a raw export's SHAPE without processing it — family (geometry- or
      texture-heavy), triangle and topstitch counts, the material census,
      colourways, and any fabric material that is metallic with nothing to
      override it. Reads the JSON chunk only, so a 1.2 GB export is as fast as a
      5 MB one. Run this BEFORE spending a pipeline run.

  pnpm pipeline overlays <file.glb> [...] [--out <dir>] [--json]
      Find printed layers stacked on the cloth beneath them — the cause of the
      white specks that appear and vanish as a garment turns — and record a
      depth bias in the asset for the viewer to obey. GEOMETRIC, not name-based.
      Report-only unless --out is given; the BIN chunk is copied byte for byte,
      so geometry, textures and compression are untouched.
      Overrides live in tools/asset-pipeline/overlay-overrides.json.

  pnpm pipeline review <dir> [<dir2>] [--port 4180]
      Serve every GLB in a directory in a live <model-viewer> — the same renderer
      and the same decoders the deployed site uses. Turn the garment, switch
      colourways, toggle diagnostic vs studio lighting. This is where artwork and
      metalness are judged: no automated gate in this system can see either.

  pnpm pipeline textures <file.glb> --out <dir> [--no-images]
      Dump every texture to PNG with a manifest.json saying which materials and
      slots use it, WHICH UV SET it samples, and what its alpha channel really
      contains. Answers "is the artwork on TEXCOORD_1?" and "did the encoder
      crush it?" without processing the file at all. Start here.

  pnpm pipeline render <file.glb> --out <dir> [flags]
      Screenshot the GLB through <model-viewer>, from fixed camera angles,
      including tight crops where printed logos live. Carries the production
      near plane and decal depth bias, so it shows what a customer sees.
      --views <file.json>  Camera list: [{ "name", "orbit", "target"?, "fieldOfView"? }]
      --variant <name>     Select a KHR_materials_variants colourway first
      --size <px>          Square render size (default 1024)
      --lighting <mode>    production (default: the studio HDR, as the viewer) or
                           diagnostic (flat neutral light, shadows off — a diff then
                           shows the artwork rather than the lighting; the evals use it)
      --no-instruments     The OLD page without the near plane or the bias. A negative
                           control only; never judge a garment with it

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
  --decimate-artwork   NEGATIVE CONTROL ONLY: let --simplify reach the print pieces again (never
                       decimated since 2026-09-02). Re-measures the damage; the robot refuses the file.
                       (default 1). This is what keeps printed logos and graphics
                       intact; lower it for a smaller file, raise it if artwork
                       looks smeared. 0 disables texture-aware decimation
  --normal-weight <n>  Same for vertex normals — protects shading (default 0.5)
  --stitch <ratio>     Decimate ONLY decorative Topstitch_* meshes to this
                       fraction, leaving the garment and its artwork untouched.
                       Use INSTEAD OF --simplify on a CLO export whose garment
                       mesh is already small: running both decimates the thread
                       twice, which frays it into spikes. Measured on a real
                       export: 99.97% of its 34.0M triangles was stitching and
                       0.03% was the garment
  --stitch-error <r>   Error budget for --stitch (default 0.0005). The real
                       aggression dial — keep it TIGHT. It self-limits: asked for
                       3% it kept 3.99% rather than damage the cord. A 20x looser
                       0.01 is what produced a rejected, frayed result.
                       ⚠️ Judge stitching on a 4-7deg crop (render --views); at
                       the default 18deg crop a ruined cord looks perfect
  --data-max-texture <px>  Cap for textures used ONLY as normal/metallicRoughness/
                       occlusion. Defaults to --max-texture (no change). Worth
                       setting to half: these carry shading, not pictures, and
                       measured 9.63 MB against the artwork's 7.03 MB purely from
                       running at colour-map resolution. Halving is invisible;
                       quartering visibly flattens fabric weave

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
    if (result.pbr) {
      const { fixed, unclassified, hardware, skippedWithMrTexture } = result.pbr
      console.log(
        `  metalness:  ${fixed.length} fabric forced to 0, ${hardware} hardware kept metal, ` +
          `${skippedWithMrTexture} already per-pixel`,
      )
      if (unclassified.length) {
        // Owner decision 2026-08-26: an unclassifiable metallic material is reported
        // on every run and never rewritten. Printing it is the whole of that
        // decision — silence here would be indistinguishable from having fixed it.
        console.log(
          `  UNCLASSIFIED (reported, never changed): ${[...new Set(unclassified)].join(', ')}`,
        )
      }
    }
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
      if (result.textures.alphaBoosted.length) {
        // MASK at alphaCutoff 0.5 discards every pixel below alpha 128, which on a
        // letterform is its anti-aliased edge — reported by the owner as "missing
        // bits and pieces". These textures had their alpha rescaled so the ink that
        // survives the cutoff matches the ink that was visible. See alpha-coverage.ts.
        console.log(
          `  ink kept:   ${result.textures.alphaBoosted.length} artwork texture(s) rescaled so the 0.5 cutoff does not eat their edges`,
        )
      }
    }
    if (result.simplify) {
      const { attributeAware, fallback, skipped, uvSetsWeighted, artworkUntouched } =
        result.simplify
      console.log(
        `  decimation: ${attributeAware} primitive(s) with UV error in the budget, ${fallback} fallback, ${skipped} skipped`,
      )
      // Since 2026-09-02 a print piece is never decimated (fix plan Rank 3): say which.
      console.log(
        `  prints:     ${artworkUntouched} print piece(s) left exactly as exported${
          artworkUntouched ? `: ${result.simplify.artworkUntouchedMaterials.join(', ')}` : ''
        }`,
      )
      console.log(
        `  UV sets:    ${uvSetsWeighted.map((n) => `TEXCOORD_${n}`).join(', ') || 'none'} weighted against the error budget`,
      )
      if (result.simplify.artworkAtRisk.length) {
        console.log(
          `  ⚠️ AT RISK:  ${result.simplify.artworkAtRisk.length} print piece(s) were DECIMATED — ${result.simplify.artworkAtRisk.join(', ')}. The robot refuses this file.`,
        )
      }
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

    /*
     * What the file is MADE OF, which nothing reported until 2026-08-29.
     *
     * Every other size figure here is a total, and a total hid the largest cheap win in
     * the catalogue for weeks: texture coordinates are the biggest thing in a garment
     * (46.8% of n001's geometry, 51.6% of v001's) and the only attribute left
     * uncompressed, because CLO writes UVs far outside 0..1 and the quantizer correctly
     * refuses them. glTF-Transform says so on every run — "Skipping TEXCOORD_0; out of
     * [0,1] range" — into a stream nobody reads.
     *
     * Graphics memory is the other half of Finding 7 and is NOT here: it needs each
     * image's pixel dimensions, which `inventoryTextures` already decodes. Reporting it
     * here would decode every texture a second time, so it belongs with that inventory.
     * `textureVramBytes` in attribute-bytes.ts is the tested arithmetic for it.
     */
    try {
      const gltf = await readGltfJson(result.outputFile)
      const composition = attributeBytes(gltf, result.bytesAfter)
      for (const line of formatAttributeBytes(composition)) console.log(line)
    } catch {
      // Reporting must never fail a build that otherwise succeeded.
    }

    console.log('\nNext: run "pnpm pipeline validate" with --expect before uploading to the CMS.')
    return
  }

  if (command === 'overlays') {
    /*
     * Find printed layers stacked on cloth, and record the depth bias in the asset.
     *
     * REPORT-ONLY WITHOUT --out. Writing is opt-in because the thing being written is a
     * rendering decision, and the root CLAUDE.md's rule for this pipeline is to look at
     * the output rather than trust a number. Run it bare first, read the table, then
     * write.
     */
    const files: string[] = []
    let outDir: string | undefined
    let asJson = false
    let alphaModes: string[] | undefined
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]
      if (arg === undefined) continue
      if (arg === '--out') outDir = rest[++i]
      else if (arg === '--json') asJson = true
      // Every alpha mode is the default since 2026-09-03 (CI-04); the flag is kept so a
      // documented command line still parses, and --alpha-modes narrows on purpose.
      else if (arg === '--all-alpha-modes') alphaModes = undefined
      else if (arg === '--alpha-modes') {
        const value = rest[++i]
        if (!value) fail('--alpha-modes needs a comma list, e.g. OPAQUE,MASK')
        alphaModes = value.split(',').map((m) => m.trim().toUpperCase())
      } else if (!arg.startsWith('--')) files.push(arg)
    }
    if (!files.length) fail('Missing <file.glb> — one or more GLBs to inspect')
    if (outDir === undefined && rest.includes('--out')) fail('--out needs a directory')

    let overrides: OverlayOverride[] = []
    const overridePath = new URL('../overlay-overrides.json', import.meta.url)
    try {
      overrides = JSON.parse(await readFile(overridePath, 'utf8')).overrides ?? []
    } catch {
      // Absent is fine — the file is a convenience, not a requirement.
    }

    let wrote = 0
    let failed = 0
    for (const file of files) {
      const name = basename(file, '.glb')
      // readGlb, not io.read: six raw exports declare a texture pointing at no image and
      // a plain read throws — which killed the whole batch on Minecut (audit CI-03,
      // HR-1, MAT-06). The pipeline itself reads through the repair; so does this.
      let readings: ReturnType<typeof measureOverlays>
      let bytes: Uint8Array
      let result: ReturnType<typeof annotateGlbOverlays>['result']
      try {
        readings = measureOverlays((await readGlb(file)).document)
        ;({ bytes, result } = annotateGlbOverlays(new Uint8Array(await readFile(file)), readings, {
          garment: name,
          overrides,
          ...(alphaModes ? { alphaModes } : {}),
        }))
      } catch (error) {
        failed++
        console.error(
          `\n${name}: could not be measured — ${error instanceof Error ? error.message : String(error)}`,
        )
        continue
      }
      if (asJson) {
        console.log(JSON.stringify({ garment: name, ...result, readings }, null, 2))
      } else {
        console.log(`\n${name}`)
        // The summary counts its OWN verdicts (audit A-07, B-04): until 2026-09-03 it
        // printed "flagged 0" beside readings that said overlay, because the alpha filter
        // dropped them silently and nothing said so (F1-08).
        console.log(
          `  ${result.measured} primitive(s) measured, ${result.overlayReadings} read as a printed layer on cloth → ` +
            `${result.flagged.length} material(s) flagged across ${result.overlayPrimitives} primitive(s)` +
            `${result.review.length ? `, ${result.review.length} for review` : ''}` +
            `${result.skippedByAlphaMode ? `, ${result.skippedByAlphaMode} skipped by --alpha-modes` : ''}` +
            `${result.threadIgnored ? `, ${result.threadIgnored} on thread/hardware ignored` : ''}` +
            `${result.clones ? `, ${result.clones} cloned` : ''}`,
        )
        for (const f of result.flagged)
          console.log(
            `    #${f.index} ${f.name}${f.clonedFrom === undefined ? '' : ` (clone of #${f.clonedFrom})`}`,
          )
        for (const r of result.review)
          console.log(
            `    REVIEW (not biased) ${r.material} — confidence ${r.confidence.toFixed(2)}, ${r.reason}`,
          )
        for (const stale of result.staleOverrides)
          console.log(`    ⚠️ STALE OVERRIDE matched nothing: "${stale.material}" — ${stale.note}`)
      }
      if (outDir !== undefined) {
        // ⚠️ Refuse to write a file whose BIN chunk did not survive. The whole reason
        // this patches JSON rather than re-serialising is that geometry must not move.
        if (!result.binIdentical) fail(`${name}: the binary chunk changed — refusing to write`)
        await mkdir(outDir, { recursive: true })
        await writeFile(join(outDir, `${name}.glb`), bytes)
        wrote++
      }
    }
    if (failed) {
      console.error(`\n${failed} file(s) could not be measured; the rest were reported above.`)
      process.exitCode = 1
    }
    if (outDir !== undefined) {
      console.log(
        `\nWrote ${wrote} file(s) to ${outDir}. Geometry and textures are byte-identical.`,
      )
      console.log('Next: pnpm pipeline review <that dir> — and LOOK at the garment.')
    } else if (!asJson) {
      console.log('\nReport only. Pass --out <dir> to write the annotated GLBs.')
    }
    return
  }

  if (command === 'review') {
    // ⚠️ Walk the arguments; do NOT filter on `!startsWith('--')`. That was the
    // first version and it read the PORT NUMBER as a second directory —
    // `review <dir> --port 4180` reported "2 directories" and quietly tried to
    // readdir("4180"). Harmless only because the failure is caught, and exactly the
    // shape recorded in apps/shrink/container/server.ts where a bare argument
    // became the input path. Found by running the command, not by reading it.
    const dirs: string[] = []
    let port = 4180
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]
      if (arg === undefined) continue
      if (arg === '--port') {
        port = finiteNumber(rest[++i], '--port')
      } else if (!arg.startsWith('--')) {
        dirs.push(arg)
      }
    }
    if (!dirs.length) fail('Missing <dir> — a directory of .glb files to review')

    const handle = await startReviewServer(dirs, port)
    const count = (await (await fetch(`${handle.url}api/garments`)).json()) as unknown[]
    console.log(`Review viewer: ${handle.url}`)
    console.log(`  ${count.length} garment(s) from ${dirs.length} director(y/ies).`)
    console.log('  Turn each garment. Switch colourways. Toggle the lighting.')
    console.log('  A blank model is a DECODER problem, not a verdict — the page says so.')
    console.log('  Ctrl-C to stop.')
    // Deliberately does not return: the server is the command.
    return
  }

  if (command === 'describe') {
    const files = rest.filter((a) => !a.startsWith('--'))
    if (!files.length) fail('Missing <file.glb>')
    const asJson = rest.includes('--json')

    const results: GlbDescription[] = []
    for (const file of files) results.push(await describeGlb(file))

    // Khronos glTF-Validator on the RAW exports. REPORTED, NEVER BLOCKING — these
    // files are the customer's, not ours, and refusing to describe one would stop
    // work on a defect nobody here can re-export away. (Our own OUTPUT is a
    // different matter and `validate` does refuse it.)
    //
    // ⚠️ Opt-in via --spec, and NOT part of describeGlb. This reads the whole file:
    // ~3.4x its size in memory, measured. `describeGlb` is called by the shrink
    // container on the raw upload and reads only the JSON chunk; putting this
    // inside it would turn a 1.25 GB export into an OOM in production.
    const withSpec = rest.includes('--spec')
    const specResults: SpecFileCheck[] = []
    if (withSpec) {
      for (const d of results) {
        specResults.push(await checkGltfSpecFileGuarded(d.file, d.bytes))
      }
    }

    if (asJson) {
      console.log(
        JSON.stringify(withSpec ? { garments: results, spec: specResults } : results, null, 2),
      )
      return
    }

    // One line per garment, so a 28-file run is scannable.
    console.log(
      'FAMILY    %TEX   TEXmb    GEOmb    TRIS          STITCH%  MATS  BLEND  FIX  ?  CW  FILE',
    )
    const mb = (bytes: number) => (bytes / 1048576).toFixed(1)
    for (const d of results) {
      if (d.error) {
        console.log(`ERROR     ${d.error}  —  ${d.file.split('/').pop()}`)
        continue
      }
      console.log(
        `${d.family.padEnd(9)}${(d.textureFraction * 100).toFixed(0).padStart(4)}%` +
          `${mb(d.textureBytes).padStart(8)}${mb(d.geometryBytes).padStart(9)}` +
          `${d.triangles.toLocaleString().padStart(14)}` +
          `${(d.stitchFraction * 100).toFixed(1).padStart(8)}%` +
          `${String(d.materials.total).padStart(6)}${String(d.materials.blend).padStart(7)}` +
          `${String(d.pbrSuspects.length).padStart(5)}` +
          `${String(d.unclassifiedMetallic.length).padStart(3)}` +
          `${String(d.colourways.count).padStart(4)}  ${d.file.split('/').pop()}`,
      )
    }

    const ok = results.filter((d) => !d.error)
    const named = ok.reduce((n, d) => n + d.images.named, 0)
    const totalImages = ok.reduce((n, d) => n + d.images.total, 0)
    console.log('')
    console.log(`  files:        ${results.length} (${results.length - ok.length} unreadable)`)
    console.log(
      `  families:     ${ok.filter((d) => d.family === 'texture').length} texture, ` +
        `${ok.filter((d) => d.family === 'geometry').length} geometry, ` +
        `${ok.filter((d) => d.family === 'mixed').length} mixed`,
    )
    console.log(
      `  metalness:    ${ok.reduce((n, d) => n + d.pbrSuspects.length, 0)} fabric to fix, ` +
        `${ok.reduce((n, d) => n + d.unclassifiedMetallic.length, 0)} unclassified (reported only)`,
    )
    console.log(`  images:       ${totalImages}, of which ${named} carry a name or URI`)
    if (named > 0) {
      // A CLO version that starts naming images would silently re-enable a
      // texture-name classifier this pipeline deliberately does not have.
      console.log('  NOTE:         CLO exports have always had 0 named images. Something changed.')
    }

    // ⚠️ LOUD ON PURPOSE — owner decision 2026-08-26. STRUCTURE POLO SET declares
    // five colourways and binds NONE of them (0 of 320 primitives carry a
    // KHR_materials_variants mapping), so a published switcher would show five
    // buttons that do nothing. It is a defect in the garment, not in the pipeline,
    // and re-exporting from CLO is not available — so it is REPORTED every run
    // rather than quietly patched to look fine.
    if (withSpec) {
      const checked = specResults.filter((r) => r.spec)
      const failing = checked.filter((r) => (r.spec?.counts.errors ?? 0) > 0)
      const skipped = specResults.filter((r) => r.skipped)
      console.log('')
      console.log(
        `  glTF spec:    ${checked.length} checked, ${failing.length} with error(s)` +
          `${skipped.length ? `, ${skipped.length} skipped` : ''}`,
      )
      for (const r of failing) {
        console.log(`      ${r.file.split('/').pop()} — ${r.spec?.counts.errors} error(s)`)
        for (const line of describeSpecIssues(r.spec?.errors ?? [], 3))
          console.log(`        ${line}`)
      }
      // Named, never silent: a file nobody could check must not read as a file
      // that passed.
      for (const r of skipped)
        console.log(`      SKIPPED ${r.file.split('/').pop()} — ${r.skipped}`)
    }

    const unbound = ok.filter((d) => d.colourways.count > 0 && !d.colourways.fullyMapped)
    if (unbound.length) {
      console.log('')
      console.log('  ⚠️  DO NOT PUBLISH — COLOURWAYS DECLARED BUT NOT BOUND:')
      for (const d of unbound) {
        console.log(
          `      ${d.file.split('/').pop()} — ${d.colourways.count} colourways declared, ` +
            'no primitive is variant-mapped. Every colour renders identically and the ' +
            'switcher on the live site would do nothing.',
        )
      }
    }
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

    // Khronos glTF-Validator. `validate` runs on what THIS PIPELINE PRODUCED, so
    // an error here is our bug, not the customer's — see gltf-spec.ts. Printed
    // whatever the verdict, because "checked, clean" and "nobody looked" must not
    // look the same; that distinction is why `artworkVerdict: 'ok'` is recorded
    // rather than merely implied.
    const spec = report.spec
    console.log(
      `  glTF spec:  ${spec.counts.errors} error(s), ${spec.counts.warnings} warning(s)` +
        `, ${spec.counts.infos} info(s) — validator ${spec.validatorVersion}`,
    )
    for (const line of describeSpecIssues(spec.warnings)) console.log(`  spec warn:  ${line}`)
    if (spec.counts.errors > 0) {
      for (const line of describeSpecIssues(spec.errors, 10)) console.error(`  SPEC ERROR: ${line}`)
      fail(
        `${spec.counts.errors} glTF specification error(s). This file is not valid glTF, so a ` +
          'renderer may reject or mis-draw it. This is a defect in what the pipeline produced, ' +
          'not in the CLO export — do not publish it.',
      )
    }

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
    /*
     * Graphics memory — Finding 7. Reported HERE because `inventoryTextures` has already
     * decoded every image's dimensions; doing it in the optimize summary would decode
     * them all a second time.
     *
     * Why it matters: every size limit in this project measures the FILE. What runs a
     * phone out of memory is how big the pictures become once unpacked onto the graphics
     * chip, and the two differ by around 100x (measured: 0.4 MB of texture data becoming
     * 38.1 MB of graphics memory). A garment can sit comfortably under the 40 MB ceiling
     * and still be far too heavy for an older phone, with nothing in the file sizes to
     * show it — which is exactly what makes that crash hard to diagnose.
     */
    const inventoryFileBytes = await stat(file)
      .then((s) => s.size)
      .catch(() => 0)
    for (const line of formatVram(summariseVram(inventory.textures), inventoryFileBytes))
      console.log(line)
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
    let lighting: LightingMode = 'production'
    let instruments = true
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!
      if (arg === '--out') outDir = rest[++i] ?? null
      else if (arg === '--views') viewsFile = rest[++i] ?? null
      else if (arg === '--variant') variant = rest[++i] ?? null
      else if (arg === '--size') dimension = finiteNumber(rest[++i], '--size')
      else if (arg === '--lighting') {
        const value = rest[++i]
        if (value !== 'production' && value !== 'diagnostic') {
          fail(`--lighting must be production or diagnostic, got ${value ?? '(nothing)'}`)
        }
        lighting = value
      } else if (arg === '--no-instruments') instruments = false
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
      lighting,
      instruments,
      /*
       * `!== undefined`, NOT a truthiness check. `--size 0` parsed to 0, which is
       * FALSY, so the flag was silently dropped and the default used — while
       * `--size abc` parsed to NaN, which is TRUTHY, so garbage was silently
       * accepted. `finiteNumber` now rejects the second; this line fixes the first.
       * Exactly the bug `finiteNumber` was written for, in the argument reader the
       * original fix did not reach.
       */
      ...(dimension !== undefined ? { width: dimension, height: dimension } : {}),
    })
    console.log(`Rendered ${result.files.length} view(s) of ${file} → ${outDir}`)
    console.log(`  views:      ${result.files.join(', ')}`)
    console.log(`  variants:   ${result.availableVariants.join(', ') || '(none bound)'}`)
    if (result.flatViews.length) {
      console.log(
        `  ⚠️ FLAT:    ${result.flatViews.length} view(s) rendered a single flat colour — ${result.flatViews.join(', ')}. They measured nothing; fix the camera before comparing.`,
      )
    }
    console.log(
      `  lighting:   ${lighting}${instruments ? '' : '   ⚠️ instruments OFF — a negative control, not a judgement'}`,
    )
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
      else if (arg === '--gain') gain = finiteNumber(rest[++i], '--gain')
      else if (!arg.startsWith('--')) positional.push(arg)
    }
    const [dirA, dirB] = positional
    if (!dirA || !dirB) fail('Usage: compare <dirA> <dirB> --out <sheet.png>')
    if (!out) fail('Missing --out <sheet.png>')

    // `!== undefined` for the same reason as --size above: `--gain 0` is a
    // legitimate request for no amplification and was being read as "not supplied".
    const result = await compareRenders(dirA, dirB, out, gain !== undefined ? { gain } : {})
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
