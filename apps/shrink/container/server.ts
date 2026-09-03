/**
 * Shrink container HTTP server.
 *
 * Runs inside the Cloudflare Container (Linux/amd64, Node). It receives a job
 * from the shrink Worker, pulls the raw GLB straight from the private ingest
 * bucket over R2's S3 API (read-only creds passed per-request), runs the EXISTING
 * asset pipeline (optimize --simplify 0.05 --meshopt, opaque on by default; then
 * validate), and returns the shrunk GLB bytes with a base64 JSON report in the
 * `x-shrink-report` header.
 *
 * The pipeline is reused as-is by relative import — the same source the CLI and
 * the local one-click helper use. The Dockerfile preserves the monorepo layout
 * so this path resolves both locally and in the image.
 */
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { AwsClient } from 'aws4fetch'
import {
  assertFlagsOnly,
  optimizeGlb,
  parseOptimizeArgs,
} from '../../../tools/asset-pipeline/src/optimize'
import { describeGlb, readGltfJson } from '../../../tools/asset-pipeline/src/describe'
import { readGlb } from '../../../tools/asset-pipeline/src/io'
import { annotateGlbOverlays } from '../../../tools/asset-pipeline/src/overlay-annotate'
import { measureOverlays } from '../../../tools/asset-pipeline/src/overlay-depth'
import {
  describeInkRow,
  type InkContrastRow,
  measureInkContrast,
} from '../../../tools/asset-pipeline/src/ink-contrast'
import { refineFlags } from '../../../tools/asset-pipeline/src/strategy'
import {
  attributeBytes,
  formatAttributeBytes,
} from '../../../tools/asset-pipeline/src/attribute-bytes'
import { describeSpecIssues } from '../../../tools/asset-pipeline/src/gltf-spec'
import { inspectGlb } from '../../../tools/asset-pipeline/src/validate'
import { buildReportText, objectUrl, suggestedFilename } from './report'

const PORT = Number(process.env.PORT ?? 8080)

interface ShrinkRequest {
  key: string
  /**
   * Pipeline flags for this job, chosen from the raw upload's "Detail" field by
   * the shrink Worker (see shrinkFlagsFor in @run-apparel/shared).
   *
   * They are passed per request rather than hardcoded here because the pipeline
   * source is baked into this container image: hardcoding meant every tuning
   * change cost a Docker build and a `wrangler deploy`. Absent (an older worker,
   * or a replayed message) falls back to the previous fixed behaviour.
   */
  flags?: string[]
  s3: {
    endpoint: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
  }
}

/** What this container did before flags were passed in; still the fallback. */
const DEFAULT_FLAGS = ['--simplify', '0.05', '--meshopt']

export type InkScan =
  | {
      prints: number
      colourways: number
      rows: number
      flagged: number
      /** The flagged rows, at most 24, in the owner's words. */
      lines: string[]
      /** The flagged rows themselves, bounded, for the CMS record. */
      flaggedRows: InkContrastRow[]
    }
  | { error: string }

export type OverlayScan =
  | {
      measured: number
      overlayReadings: number
      flagged: number
      review: number
      clones: number
      threadIgnored: number
      written: boolean
    }
  | { error: string }

/**
 * Measure the finished file for printed layers stacked on cloth and write the
 * depth-bias records the viewer obeys (tools/asset-pipeline/src/overlay-depth.ts).
 * Never throws: a failed scan is reported, not a failed job.
 */
/**
 * Does the ink come out the colour of the cloth it sits on? (fix plan Rank 9). Report,
 * never a change: two automatic fixes painted the wrong prints white. The owner rules
 * per print from the report and `pipeline ink --strip`.
 */
async function scanInk(outPath: string): Promise<InkScan> {
  try {
    const { document } = await readGlb(outPath)
    const readings = measureOverlays(document)
    const report = await measureInkContrast(document, readings)
    return {
      prints: report.prints,
      colourways: report.colourways.length,
      rows: report.rows.length,
      flagged: report.flagged.length,
      lines: report.flagged.slice(0, 24).map(describeInkRow),
      flaggedRows: report.flagged.slice(0, 24),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

async function scanOverlays(outPath: string, filename: string): Promise<OverlayScan> {
  try {
    const readings = measureOverlays((await readGlb(outPath)).document)
    const annotated = annotateGlbOverlays(new Uint8Array(await readFile(outPath)), readings, {
      garment: filename.replace(/\.glb$/i, ''),
    })
    const written = annotated.result.binIdentical && annotated.result.flagged.length > 0
    if (written) await writeFile(outPath, annotated.bytes)
    return {
      measured: annotated.result.measured,
      overlayReadings: annotated.result.overlayReadings,
      flagged: annotated.result.flagged.length,
      review: annotated.result.review.length,
      clones: annotated.result.clones,
      threadIgnored: annotated.result.threadIgnored,
      written,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

async function handleShrink(body: ShrinkRequest): Promise<{ bytes: Buffer; report: object }> {
  const aws = new AwsClient({
    accessKeyId: body.s3.accessKeyId,
    secretAccessKey: body.s3.secretAccessKey,
    service: 's3',
    region: 'auto',
  })

  const dir = await mkdtemp(join(tmpdir(), 'shrink-'))
  const rawPath = join(dir, 'raw.glb')
  const outPath = join(dir, 'out.glb')

  try {
    // 1. Pull the raw GLB from the ingest bucket → temp file (streamed, not buffered).
    const getRes = await aws.fetch(objectUrl(body.s3.endpoint, body.s3.bucket, body.key), {
      method: 'GET',
    })
    if (!getRes.ok || !getRes.body) {
      throw new Error(`Could not read raw object "${body.key}" from ingest (${getRes.status}).`)
    }
    await pipeline(
      Readable.fromWeb(getRes.body as import('node:stream/web').ReadableStream),
      createWriteStream(rawPath),
    )

    // 2. Run the SAME pipeline the CLI uses. parseOptimizeArgs applies the exact
    //    defaults (WebP textures, opaque + double-sided fabric) plus our flags.
    //    Only `--`-prefixed flags and their values are accepted — assertFlagsOnly
    //    enforces that and throws naming the offending token.
    //
    //    ⚠️ Until 2026-08-18 this comment described a control that did not exist.
    //    The filter below checks only that a member is a string, and
    //    parseOptimizeArgs ends its loop with
    //    `else if (!arg.startsWith('--')) input = arg` — so ANY bare string here
    //    became the input path. Measured: appending '/etc/passwd' to
    //    ['in.glb', '--out', 'o.glb'] changed the input to /etc/passwd. What
    //    actually kept this safe was upstream — shrinkFlagsFor returns hardcoded
    //    literals chosen by a two-value enum — not the line the comment pointed
    //    at, which is precisely what made the comment dangerous.
    const requested = Array.isArray(body.flags) && body.flags.length ? body.flags : DEFAULT_FLAGS
    const baseFlags = requested.filter((flag): flag is string => typeof flag === 'string')

    // WHY THE FAMILY IS DECIDED HERE AND NOT IN THE WORKER. shrinkFlagsFor runs in
    // the Worker, which has an R2 key and not the file; and packages/shared is
    // lint-forbidden from importing node:*, so it can never read one. The file first
    // exists on disk at this exact point. describeGlb reads only the JSON chunk, so
    // this costs milliseconds even on a 1.2 GB export.
    //
    // Measured 2026-08-26 across all 28 raw exports: 15 are texture-heavy, and on
    // those the geometry-first budget in shrinkFlagsFor spends itself on a lever
    // that has little to pull and then compresses the textures to fit. X-MILO goes
    // from 71.0 MB — over the publish ceiling — to 24.8 MB with its artwork textures
    // byte-identical. See tools/asset-pipeline/src/strategy.ts.
    //
    // A file this cannot read falls through as 'mixed', which refineFlagsForFamily
    // returns UNCHANGED: a readout failure must never silently alter a garment's
    // compression.
    // Since 2026-09-02 this also drops general decimation for a SMALL export (see
    // SMALL_EXPORT_MAX_TRIANGLES in strategy.ts): the finished garments are two orders
    // of magnitude smaller than the exports the presets were written for, and on them
    // `--simplify` saved a few hundred KB and tore the prints (audit F1-02, A-01).
    const description = await describeGlb(rawPath)
    const family = description.error ? 'mixed' : description.family
    const flags = refineFlags(baseFlags, description)

    // Still enforced, and still the real control: assertFlagsOnly throws on any bare
    // token, and everything refineFlagsForFamily adds is a literal in strategy.ts.
    assertFlagsOnly(flags)
    const { options } = parseOptimizeArgs([rawPath, '--out', outPath, ...flags])
    const opt = await optimizeGlb(rawPath, outPath, options)

    // 2b. Depth-bias records for printed layers stacked on cloth (fix plan Rank 7C).
    //
    // ⚠️ UNTIL 2026-09-03 THIS CONTAINER NEVER RAN THE OVERLAY SCAN — the detector
    // existed, the viewer obeyed its records, and no record ever reached production
    // (audit F2-06, MAT-04, MAT-05, HG-05): Minecut's 36 OPAQUE prints sat 0.100 mm on
    // the cloth with nothing to separate them. Measured on the FINISHED file, after
    // decimation, so the geometry the record describes is the geometry that ships;
    // the BIN chunk is copied byte for byte and the write is refused if it moved.
    // Wrapped: a scan that fails must not fail a job that otherwise succeeded, and
    // the report says so instead.
    const overlays = await scanOverlays(outPath, suggestedFilename(body.key))
    const ink = await scanInk(outPath)

    // 3. Validate the result for the report (variants, warnings, translucency).
    const glb = await inspectGlb(outPath)
    const bytes = await readFile(outPath)

    const filename = suggestedFilename(body.key)
    const found = glb.variantsInFileOrder.length ? glb.variantsInFileOrder : glb.variants
    // Composition, computed from the finished file's JSON chunk only — no image decode,
    // so it costs a few milliseconds on a 1.25 GB garment exactly as on a 5 MB one.
    // Wrapped because reporting must never fail a job that otherwise succeeded.
    let composition: string[] | undefined
    try {
      composition = formatAttributeBytes(
        attributeBytes(await readGltfJson(outPath), opt.bytesAfter),
      )
    } catch {
      composition = undefined
    }
    const text = buildReportText(opt, glb, filename, composition, overlays, ink)

    const report = {
      ok: true,
      suggestedFilename: filename,
      sizeBytes: opt.bytesAfter,
      variants: glb.variants,
      variantsInFileOrder: found,
      warnings: glb.warnings,
      translucentMaterialCount: glb.translucentMaterialCount,
      texCoordsInUse: glb.texCoordsInUse,
      family,
      describe: description.error
        ? { error: description.error }
        : {
            family: description.family,
            textureFraction: Number(description.textureFraction.toFixed(4)),
            triangles: description.triangles,
            stitchFraction: Number(description.stitchFraction.toFixed(4)),
            pbrSuspects: description.pbrSuspects.map((s) => s.name),
            unclassifiedMetallic: description.unclassifiedMetallic.map((s) => s.name),
            colourways: description.colourways.count,
            fullyMapped: description.colourways.fullyMapped,
          },
      variantColours: glb.variantColours,
      /**
       * ⚠️ THE VERDICT WAS COMPUTED AND THROWN AWAY UNTIL 2026-08-29.
       *
       * `inspectGlb` above runs the official Khronos validator on every garment, and
       * this object kept SEVEN neighbouring fields from that same result while dropping
       * the one that says whether the file is valid. `report.ts` never read it either,
       * and `ShrinkReport` in the Worker had no such field at all — so the verdict was
       * structurally unable to leave this function.
       *
       * The consequence was measured: both live garments are invalid glTF (44 errors on
       * the cycling suit), from a WebP pass that wrote `image/webp` without declaring
       * `EXT_texture_webp`. Browsers sniff the bytes and render anyway, which is exactly
       * why every gate stayed green. A stricter runtime — a factory system, a
       * marketplace, someone's own 3D software — is entitled to refuse them.
       *
       * BOUNDED ON PURPOSE. Counts plus at most ten one-line summaries, not the raw
       * issue arrays: this report is JSON over the wire and then a field in D1, and a
       * badly broken file can carry hundreds of issues.
       */
      spec: {
        validatorVersion: glb.spec.validatorVersion,
        errors: glb.spec.counts.errors,
        warnings: glb.spec.counts.warnings,
        issues: describeSpecIssues(glb.spec.errors, 10),
      },
      crushedArtwork: glb.crushedArtwork,
      artworkAlphaProblems: glb.artworkAlphaProblems,
      artworkSoftOnBlend: glb.artworkSoftOnBlend,
      overlays,
      ink,
      ...(opt.simplify ? { simplify: opt.simplify } : {}),
      ...(opt.textures ? { textures: opt.textures } : {}),
      ...(opt.solidify ? { solidify: opt.solidify } : {}),
      text,
    }
    return { bytes, report }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end('ok')
    return
  }
  if (req.method !== 'POST' || req.url !== '/shrink') {
    res.writeHead(404).end('not found')
    return
  }

  const chunks: Buffer[] = []
  req.on('data', (c: Buffer) => chunks.push(c))
  req.on('end', () => {
    void (async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as ShrinkRequest
        if (!body?.key || !body?.s3?.accessKeyId) throw new Error('Missing key or S3 credentials.')
        const { bytes, report } = await handleShrink(body)
        res.writeHead(200, {
          'content-type': 'model/gltf-binary',
          'x-shrink-report': Buffer.from(JSON.stringify(report)).toString('base64'),
        })
        res.end(bytes)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        res.writeHead(500, {
          'content-type': 'text/plain',
          'x-shrink-report': Buffer.from(JSON.stringify({ ok: false, error: message })).toString(
            'base64',
          ),
        })
        // Generic on purpose. `message` can carry mkdtemp paths and stack text
        // (CodeQL js/stack-trace-exposure). The full detail is already in the
        // `x-shrink-report` header set above, which the Worker now reads via
        // readContainerFailure() in apps/shrink/src/containerFailure.ts.
        // Do not put it back in the body.
        res.end('Shrink failed.')
      }
    })()
  })
})

server.listen(PORT, () => {
  console.log(`shrink container listening on :${PORT}`)
})
