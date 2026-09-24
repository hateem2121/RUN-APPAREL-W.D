#!/usr/bin/env node
/**
 * Upload a LOCAL CLO export into the ingest bucket and start the shrink robot.
 *
 * WHY THIS EXISTS. Until 2026-09-24 this sat alongside `ingest-from-archive.mjs`, which
 * started a shrink from an S3 `CopyObject` when the bytes were already in R2 — it moved
 * 1.71 GiB in 110 s without touching this machine's uplink. That script was retired with
 * the R2 archive bucket it copied from (owner decision — docs/BACKUP-RESTORE.md): every
 * raw export now starts on the owner's Mac, which is what this script has always done —
 * it is what arrived on 2026-09-07: five garments, 1.45 GB, uploaded straight from local
 * disk.
 *
 * The documented alternative is a browser upload into the CMS. That re-sends the bytes
 * through a Worker, and at the uplink measured here on 2026-09-07 (595,739 B/s against
 * Cloudflare's own `speed.cloudflare.com/__up`) a single 499 MB export is ~14 minutes in
 * ONE request — long enough that a dropped connection costs the whole transfer with
 * nothing to resume from.
 *
 * So this uploads straight to R2 with a MULTIPART upload:
 *  - a failed part is retried on its own instead of restarting the file;
 *  - parts go up concurrently, in case the limit is per-connection rather than the link.
 *    A single stream measured 0.58 MB/s; whether four help is printed live by the progress
 *    line, so the real figure is read off a run rather than assumed here;
 *  - the object lands under the same key shape the robot already expects.
 *
 * ⚠️ THE ETAG OF A MULTIPART UPLOAD IS NOT A CONTENT HASH. It is a digest OF THE PART
 * DIGESTS with a `-N` suffix, so it cannot be compared against a local sha256 — the same
 * trap measured on `ARISAN BRA`'s upload to the (since-retired) R2 archive bucket. The
 * proof used here is the stored object's SIZE read back with a HEAD after completion,
 * which is also what `RawUploads.beforeChange` checks.
 *
 * ⚠️ THE FILENAME BECOMES THE PUBLIC MODEL URL. `apps/shrink/container/report.ts` derives
 * it with `suggestedFilename()` and appends `-optimized.glb`, so names here are lowercase
 * kebab-case and carry the export date — matching the eleven already live, and guaranteeing
 * a fresh cache key rather than reusing one.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=$(cat ~/cf_token.txt) CMS_API_KEY=… \
 *     node scripts/ingest-local-glb.mjs <garment> [--dry-run] [--upload-only]
 *   node scripts/ingest-local-glb.mjs --list
 */
import { createHash } from 'node:crypto'
import { open, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AwsClient } from '../apps/shrink/container/node_modules/aws4fetch/dist/aws4fetch.esm.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const INGEST_BUCKET = 'run-apparel-viewer-ingest'
const CMS_ORIGIN = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'
/**
 * Where the .glb files are. ⚠️ The owner's `FIXED GLBs` folder holds ZIPS, one GLB inside
 * each, so it is NOT a valid value here — unzip first and point `GLB_SOURCE_DIR` at the
 * extracted files. The default is the zip folder anyway, because that is the canonical home
 * of production-ready exports (owner, 2026-09-02) and a wrong path fails loudly on `statSync`
 * rather than uploading something unintended.
 */
const SOURCE_DIR = process.env.GLB_SOURCE_DIR ?? '/Users/hateemjamshaid/Documents/FIXED GLBs'

const PART_BYTES = 16 * 1024 * 1024
const CONCURRENCY = 4

/**
 * The five exports dated 2026-09-07, smallest first — the order they are meant to run in,
 * so each success de-risks the next and the two heaviest come last.
 *
 * `source` is the basename inside SOURCE_DIR exactly as CLO wrote it, spaces and all;
 * `ENDURA CROP TOP + Shorts.glb` really carries a `+`. Not a typo to tidy.
 *
 * `slug` is resolved to a product id at runtime rather than hardcoded, because two renames
 * on this project have already broken a derived key.
 */
const GARMENTS = {
  'capsule-core-hoodie': {
    source: 'CAPSULE CORE HOODIE.glb',
    file: 'capsule-core-hoodie-2026-09-07.glb',
    slug: 'r-cch',
  },
  'geovent-tennis-dress': {
    source: 'GEOVENT TENNIS DRESS.glb',
    file: 'geovent-tennis-dress-2026-09-07.glb',
    slug: 'r-gtd',
  },
  'the-aggressor-uniform': {
    source: 'THE AGGRESSOR UNIFORM.glb',
    file: 'the-aggressor-uniform-2026-09-07.glb',
    slug: 'r-au',
  },
  'endura-crop-top': {
    source: 'ENDURA CROP TOP + Shorts.glb',
    file: 'endura-crop-top-2026-09-07.glb',
    slug: 'r-ect',
  },
  'endurance-tracksuit': {
    source: 'ENDURANCE TRACKSUIT.glb',
    file: 'endurance-tracksuit-2026-09-07.glb',
    slug: 'r-et',
  },
}

const enc = (key) => key.split('/').map(encodeURIComponent).join('/')

/** The account id, taken from the endpoint the robot itself uses — one source of truth. */
function accountEndpoint() {
  const wrangler = readFileSync(join(here, '../apps/shrink/wrangler.jsonc'), 'utf8')
  const match = wrangler.match(/"R2_INGEST_S3_ENDPOINT":\s*"([^"]+)"/)
  if (!match) throw new Error('R2_INGEST_S3_ENDPOINT not found in apps/shrink/wrangler.jsonc')
  return match[1]
}

/**
 * S3 credentials from the Cloudflare API token: Access Key ID is the token's `id`, Secret
 * Access Key is the SHA-256 of the token value. The id is fetched rather than passed in,
 * so only the token itself is ever a secret.
 */
async function s3Client(token) {
  const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  if (!body?.success || !body?.result?.id) {
    throw new Error(
      `Could not verify the Cloudflare token: ${JSON.stringify(body?.errors ?? body)}`,
    )
  }
  return new AwsClient({
    accessKeyId: body.result.id,
    secretAccessKey: createHash('sha256').update(token).digest('hex'),
    service: 's3',
    region: 'auto',
  })
}

function readChunk(path, start, length) {
  return new Promise((resolve, reject) => {
    open(path, 'r', (err, fd) => {
      if (err) return reject(err)
      const buf = Buffer.alloc(length)
      import('node:fs').then(({ read, close }) => {
        read(fd, buf, 0, length, start, (e, bytesRead) => {
          close(fd, () => {})
          if (e) return reject(e)
          resolve(buf.subarray(0, bytesRead))
        })
      })
    })
  })
}

/** Upload one part, retrying transient failures rather than failing the whole file. */
async function putPart(aws, url, path, index, start, length) {
  const body = await readChunk(path, start, length)
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await aws.fetch(`${url}&partNumber=${index}`, { method: 'PUT', body })
      if (res.status === 200) {
        const etag = res.headers.get('etag')
        if (etag) return { PartNumber: index, ETag: etag }
        throw new Error('part 200 with no ETag')
      }
      throw new Error(`part ${index} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    } catch (err) {
      if (attempt === 4) throw err
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
}

async function multipartUpload(aws, endpoint, key, path, totalBytes) {
  const base = `${endpoint}/${INGEST_BUCKET}/${enc(key)}`
  const start = await aws.fetch(`${base}?uploads`, {
    method: 'POST',
    headers: { 'content-type': 'model/gltf-binary' },
  })
  const startBody = await start.text()
  if (start.status !== 200)
    throw new Error(`CreateMultipartUpload ${start.status}: ${startBody.slice(0, 300)}`)
  const uploadId = (startBody.match(/<UploadId>([^<]+)<\/UploadId>/) || [])[1]
  if (!uploadId) throw new Error('no UploadId in CreateMultipartUpload response')

  const jobs = []
  for (let offset = 0, i = 1; offset < totalBytes; offset += PART_BYTES, i++) {
    jobs.push({ index: i, start: offset, length: Math.min(PART_BYTES, totalBytes - offset) })
  }
  const partUrl = `${base}?uploadId=${encodeURIComponent(uploadId)}`
  const done = []
  let sent = 0
  const t0 = Date.now()
  let cursor = 0
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      const part = await putPart(aws, partUrl, path, job.index, job.start, job.length)
      done.push(part)
      sent += job.length
      const secs = (Date.now() - t0) / 1000
      process.stdout.write(
        `\r[ingest]   ${done.length}/${jobs.length} parts  ${(sent / 1048576).toFixed(0)}/${(totalBytes / 1048576).toFixed(0)} MB  ` +
          `${(sent / 1048576 / secs).toFixed(2)} MB/s  eta ${Math.round((totalBytes - sent) / (sent / secs) / 60)}m   `,
      )
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker))
  process.stdout.write('\n')

  done.sort((a, b) => a.PartNumber - b.PartNumber)
  const xml =
    '<CompleteMultipartUpload>' +
    done
      .map((p) => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag}</ETag></Part>`)
      .join('') +
    '</CompleteMultipartUpload>'
  const complete = await aws.fetch(partUrl, {
    method: 'POST',
    body: xml,
    headers: { 'content-type': 'application/xml' },
  })
  const completeBody = await complete.text()
  if (complete.status !== 200) {
    throw new Error(`CompleteMultipartUpload ${complete.status}: ${completeBody.slice(0, 400)}`)
  }
  return (Date.now() - t0) / 1000
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--list')) {
    for (const [name, g] of Object.entries(GARMENTS)) console.log(`${name}\t${g.slug}\t${g.source}`)
    return
  }
  const name = args.find((a) => !a.startsWith('--'))
  const garment = GARMENTS[name]
  if (!garment) {
    console.error(`Unknown garment "${name}". Run with --list to see the five.`)
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')
  const uploadOnly = args.includes('--upload-only')
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required (read it from ~/cf_token.txt)')

  const path = join(SOURCE_DIR, garment.source)
  const bytes = statSync(path).size
  const endpoint = accountEndpoint()
  const aws = await s3Client(token)
  const objectUrl = `${endpoint}/${INGEST_BUCKET}/${enc(garment.file)}`

  console.log(`[ingest] ${name} → ${garment.slug}`)
  console.log(`[ingest]   local:  ${garment.source}  (${(bytes / 1048576).toFixed(1)} MB)`)
  console.log(`[ingest]   ingest: ${garment.file}`)

  if (dryRun) {
    console.log('[ingest] --dry-run: stopping before the upload.')
    return
  }

  // Idempotent: an object already there at the right size is left alone, so a re-run
  // after a failed enqueue costs nothing and cannot re-send 500 MB by accident.
  const head = await aws.fetch(objectUrl, { method: 'HEAD' })
  if (head.status === 200 && Number(head.headers.get('content-length')) === bytes) {
    console.log('[ingest]   already in the ingest bucket at the right size — skipping the upload')
  } else {
    const secs = await multipartUpload(aws, endpoint, garment.file, path, bytes)
    console.log(`[ingest]   uploaded in ${secs.toFixed(0)}s`)
    const after = await aws.fetch(objectUrl, { method: 'HEAD' })
    const got = Number(after.headers.get('content-length'))
    if (after.status !== 200 || got !== bytes) {
      throw new Error(`ingest object is ${after.status} / ${got} bytes, expected 200 / ${bytes}`)
    }
    console.log(`[ingest]   verified in ingest — ${got} bytes`)
  }

  if (uploadOnly) {
    console.log('[ingest] --upload-only: the object is in place; no shrink job started.')
    return
  }

  // Resolve the product by slug. Never hardcode the id.
  const apiKey = process.env.CMS_API_KEY
  if (!apiKey) throw new Error('CMS_API_KEY is required to create the raw-upload document')
  const auth = { Authorization: `users API-Key ${apiKey}` }
  const lookup = await fetch(
    `${CMS_ORIGIN}/api/products?where[slug][equals]=${encodeURIComponent(garment.slug)}&depth=0&limit=1`,
    { headers: { ...auth, accept: 'application/json' } },
  )
  const product = (await lookup.json())?.docs?.[0]
  if (!product) throw new Error(`no product with slug "${garment.slug}"`)
  console.log(`[ingest]   product #${product.id} — ${product.productName} [${product.status}]`)

  // Create the raw-upload document the way the browser does. `clientUploadContext` MUST be
  // truthy or `@payloadcms/storage-r2` skips its own >50 MB short-circuit and the CMS Worker
  // tries to buffer the whole object.
  const form = new FormData()
  form.append('_payload', JSON.stringify({ targetProduct: product.id }))
  form.append(
    'file',
    JSON.stringify({
      clientUploadContext: { prefix: '' },
      collectionSlug: 'raw-uploads',
      filename: garment.file,
      mimeType: 'model/gltf-binary',
      size: bytes,
    }),
  )
  const created = await fetch(`${CMS_ORIGIN}/api/raw-uploads`, {
    method: 'POST',
    headers: auth,
    body: form,
  })
  const doc = await created.json()
  if (created.status >= 300) {
    console.error(`[ingest] create failed ${created.status}:`)
    console.error(JSON.stringify(doc, null, 2).slice(0, 1200))
    process.exit(1)
  }
  const d = doc.doc ?? doc
  console.log(
    `[ingest] ✅ raw upload #${d.id} created — status "${d.status}", detail "${d.detail}"`,
  )
  console.log(`[ingest]    watch: ${CMS_ORIGIN}/admin/collections/raw-uploads/${d.id}`)
}

await main()
