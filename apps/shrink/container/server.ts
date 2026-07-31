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
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { AwsClient } from 'aws4fetch'
import { optimizeGlb, parseOptimizeArgs } from '../../../tools/asset-pipeline/src/optimize'
import { SIZE_WARNING_BYTES, inspectGlb } from '../../../tools/asset-pipeline/src/validate'

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

/** Build an R2/S3 object URL, encoding each path segment but keeping slashes. */
function objectUrl(endpoint: string, bucket: string, key: string): string {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return `${endpoint.replace(/\/$/, '')}/${bucket}/${path}`
}

/** A URL-safe Media filename derived from the raw key, always ending in .glb. */
function suggestedFilename(key: string): string {
  const base = key.split('/').pop() ?? 'garment.glb'
  const stem = base.replace(/\.glb$/i, '')
  const safe = stem.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `${safe || 'garment'}-optimized.glb`
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
    await pipeline(Readable.fromWeb(getRes.body as import('node:stream/web').ReadableStream), createWriteStream(rawPath))

    // 2. Run the SAME pipeline the CLI uses. parseOptimizeArgs applies the exact
    //    defaults (WebP textures, opaque + double-sided fabric) plus our flags.
    //    Only `--`-prefixed flags and their values are accepted, so a malformed
    //    request can never smuggle in a second input path.
    const requested = Array.isArray(body.flags) && body.flags.length ? body.flags : DEFAULT_FLAGS
    const flags = requested.filter((flag): flag is string => typeof flag === 'string')
    const { options } = parseOptimizeArgs([rawPath, '--out', outPath, ...flags])
    const opt = await optimizeGlb(rawPath, outPath, options)

    // 3. Validate the result for the report (variants, warnings, translucency).
    const glb = await inspectGlb(outPath)
    const bytes = await readFile(outPath)

    const filename = suggestedFilename(body.key)
    const beforeMb = (opt.bytesBefore / 1024 / 1024).toFixed(1)
    const afterMb = (opt.bytesAfter / 1024 / 1024).toFixed(1)

    // The mobile guideline, stated plainly. Nothing in CI can check this — the
    // Lighthouse budget runs against a 10 KB placeholder, so a real 20 MB
    // garment is invisible to it — and the hard 40 MB ceiling only catches the
    // extreme case. This line is the only place the owner is told a published
    // file is heavy for a QR scan on mobile data.
    const overMobileBudget = opt.bytesAfter > SIZE_WARNING_BYTES

    // File order, not alphabetical: the CMS lists these back to the owner so
    // they can say which of their colours is which. Nothing is renamed, so it
    // no longer matters what CLO called them.
    const found = glb.variantsInFileOrder.length ? glb.variantsInFileOrder : glb.variants
    const text = [
      `Shrunk ${beforeMb} MB → ${afterMb} MB.`,
      overMobileBudget
        ? `⚠️ Still over the ${SIZE_WARNING_BYTES / 1024 / 1024} MB mobile guideline. It will publish and work, but ` +
          'it is a slow load over phone data, which is how most people reach this page. ' +
          'Most of a CLO export is geometry, so the lever is a lower Detail setting or a lighter mesh from CLO.'
        : `Within the ${SIZE_WARNING_BYTES / 1024 / 1024} MB mobile guideline.`,
      `Suggested filename: ${filename}`,
      found.length
        ? `Colours found inside your file, in order:\n${found.map((name, i) => `  ${i + 1}. ${name}`).join('\n')}`
        : 'No colours are stored inside this file. That is fine for a single-colour garment — set the product to “A separate file for each colour”.',
      `See-through (BLEND) materials: ${glb.translucentMaterialCount}`,
      // How each translucent material was resolved. "Kept see-through" is the
      // one to read: those are materials whose alpha is a genuine gradient, so
      // the pipeline declined to flatten them. If the garment is not actually
      // sheer, that is a CLO export to fix rather than a setting to change.
      opt.solidify
        ? `Transparency: ${opt.solidify.opaqued} made solid, ${opt.solidify.masked} kept as cut-out shapes, ` +
          `${opt.solidify.keptBlend} kept see-through.`
        : 'Transparency: left untouched for this job.',
      opt.textures
        ? `Textures: ${opt.textures.artwork} treated as printed artwork (encoded at high fidelity), ` +
          `${opt.textures.standard} as fabric.` +
          (opt.textures.artworkNames.length ? ` Artwork: ${opt.textures.artworkNames.join(', ')}.` : '')
        : 'Textures: not re-encoded for this job.',
      // What the decimation pass actually did. `fallback` primitives were
      // decimated position-only with borders locked, i.e. the UV weight that is
      // supposed to protect printed artwork did nothing for them — which is
      // invisible from file size alone and was costing whole sessions of tuning
      // a knob that was not connected.
      opt.simplify
        ? `Mesh decimation: ${opt.simplify.attributeAware} part(s) with artwork protection, ` +
          `${opt.simplify.fallback} without, ${opt.simplify.skipped} untouched.` +
          (opt.simplify.fallback > opt.simplify.attributeAware
            ? ' ⚠️ Most parts were decimated WITHOUT artwork protection — printed graphics on those are at risk.'
            : '')
        : 'Mesh decimation: not run for this job.',
      glb.warnings.length ? `Warnings:\n- ${glb.warnings.join('\n- ')}` : 'No warnings.',
      '',
      found.length
        ? 'Next: open the product’s Colours tab and answer “Which colour in your CLO file is this?” for each colour, then Publish. The names above are whatever CLO called them — they do not have to look like anything in particular.'
        : 'Next: open the product, attach this file to the colour it belongs to, then Publish.',
    ].join('\n')

    const report = {
      ok: true,
      suggestedFilename: filename,
      sizeBytes: opt.bytesAfter,
      variants: glb.variants,
      variantsInFileOrder: found,
      warnings: glb.warnings,
      translucentMaterialCount: glb.translucentMaterialCount,
      texCoordsInUse: glb.texCoordsInUse,
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
          'x-shrink-report': Buffer.from(
            JSON.stringify({ ok: false, error: message }),
          ).toString('base64'),
        })
        res.end(message)
      }
    })()
  })
})

server.listen(PORT, () => {
  console.log(`shrink container listening on :${PORT}`)
})
