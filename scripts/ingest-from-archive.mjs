#!/usr/bin/env node
/**
 * Put a corrected CLO export into the ingest bucket and start the shrink robot,
 * WITHOUT uploading anything from this machine.
 *
 * WHY THIS EXISTS. The eleven diffuse-off masters are already in R2, under
 * `run-apparel-archive/fixed-glbs/2026-09-03-diffuse-off/` (verified by
 * `scripts/verify-archive.mjs`: 21 of 21 at their recorded size). The documented
 * route to a shrink job is a browser upload into the CMS, which re-sends bytes the
 * account already holds — 2.9 GB over an uplink measured at ~300 kB/s on 2026-09-03,
 * i.e. hours, and for `ARISAN BRA` (1.71 GiB) a single upload of well over an hour
 * that nobody can watch. An S3 `CopyObject` moves the same bytes inside Cloudflare:
 * measured 16.9 MB in 4.9 s, and the response ETag came back IDENTICAL to the
 * source, which proves the bytes and not merely the length.
 *
 * WHY THE DOCUMENT CREATE LOOKS ODD. `RawUploads` uses `clientUploads`, so Payload
 * expects the file to be in R2 already and the create to describe it rather than
 * carry it (`payload/dist/utilities/addDataAndFileToRequest.js:49-102`): a
 * multipart POST with `_payload` (the fields) and `file` (a JSON *string* of
 * `{clientUploadContext, collectionSlug, filename, mimeType, size}`). That is
 * exactly what the browser sends; this script sends the same thing.
 *
 * ⚠️ `clientUploadContext` MUST BE TRUTHY. `@payloadcms/storage-r2`'s `getFile.js`
 * short-circuits to an empty 200 when `fileSize > 50MB && clientUploadContext` —
 * "or the Worker will run out of memory". Omit it and the CMS Worker tries to buffer
 * the whole 1.71 GiB object to satisfy a create. The bytes are never what proves the
 * upload anyway: `RawUploads.beforeChange` HEADs the ingest key, and that is the
 * check that matters.
 *
 * The filename chosen here becomes the PUBLIC model URL: the container derives it
 * with `suggestedFilename()` (`apps/shrink/container/report.ts:24`), which appends
 * `-optimized.glb`. Two consequences drove the names in GARMENTS below — they are
 * lowercase kebab-case so the public URL is clean, and they are NEW rather than
 * reusing the live names, so the replacement model gets a fresh cache key and no
 * Custom Purge is needed. (`HEAD` and `GET` land on different edge cache entries on
 * `media.wear-run.help`, so a reused key is exactly the trap that has cost sessions.)
 *
 * Usage:
 *   node scripts/ingest-from-archive.mjs --list
 *   CLOUDFLARE_API_TOKEN=$(cat ~/cf_token.txt) CMS_API_KEY=… \
 *     node scripts/ingest-from-archive.mjs <garment> [--copy-only] [--dry-run]
 *
 * Exit 0 only when the ingest object is present at its recorded size and (unless
 * --copy-only) the raw-upload document exists.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AwsClient } from '../apps/shrink/container/node_modules/aws4fetch/dist/aws4fetch.esm.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ARCHIVE_BUCKET = 'run-apparel-archive'
const INGEST_BUCKET = 'run-apparel-viewer-ingest'
const ARCHIVE_PREFIX = 'fixed-glbs/2026-09-03-diffuse-off'
const CMS_ORIGIN = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'

/**
 * The eleven corrected exports, smallest first — the order they are meant to be run
 * in, so each success de-risks the next and the two heaviest come last.
 *
 * `archive` is the basename inside ARCHIVE_PREFIX and is quoted exactly as CLO wrote
 * it: `CLASSIC SOCCER SHIRT.zip.glb` really carries `.zip` in the middle, and
 * `THE AGGRESSOR MEN  JERSEY.glb` really has two spaces. Neither is a typo to fix —
 * they are the keys in the bucket.
 *
 * `slug` is the CMS product, resolved to an id at runtime rather than hardcoded so a
 * renamed or re-imported product cannot silently point this at the wrong garment.
 */
const GARMENTS = {
  'apex-flex-pullover': {
    archive: 'APEX FLEX PULLOVER.glb',
    file: 'apex-flex-pullover-2026-09-03.glb',
    slug: 'r-afp',
  },
  'aero-tech-windbreaker': {
    archive: 'AERO-TECH WINDBREAKER.glb',
    file: 'aero-tech-windbreaker-2026-09-03.glb',
    slug: 'r-atw',
  },
  'armor-tech-jacket': {
    archive: 'ARMOR-TECH JACKET.glb',
    file: 'armor-tech-jacket-2026-09-03.glb',
    slug: 'r-atj',
  },
  'x-milo-pro-skin-suit': {
    archive: 'X-MILO PRO SKIN-SUIT.glb',
    file: 'x-milo-pro-skin-suit-2026-09-03.glb',
    slug: 'rxps',
  },
  'women-zip-up-vest': {
    archive: 'WOMEN ZIP-UP VEST.glb',
    file: 'women-zip-up-vest-2026-09-03.glb',
    slug: 'r-wzu',
  },
  'minecut-motion': {
    archive: 'MINECUT MOTION.glb',
    file: 'minecut-motion-2026-09-03.glb',
    slug: 'r-mm',
  },
  'x-milo-pro-bib': {
    archive: 'X-MILO PRO BIB.glb',
    file: 'x-milo-pro-bib-2026-09-03.glb',
    slug: 'r-xmp',
  },
  'the-aggressor-jersey': {
    archive: 'THE AGGRESSOR JERSEY.glb',
    file: 'the-aggressor-jersey-2026-09-03.glb',
    slug: 'r-aj',
  },
  'classic-soccer-shirt': {
    archive: 'CLASSIC SOCCER SHIRT.zip.glb',
    file: 'classic-soccer-shirt-2026-09-03.glb',
    slug: 'r-css',
  },
  'the-aggressor-uniform': {
    archive: 'THE AGGRESSOR MEN  JERSEY.glb',
    file: 'the-aggressor-uniform-2026-09-03.glb',
    slug: 'r-au',
  },
  'arisan-sports-bra': {
    archive: 'ARISAN BRA.glb',
    file: 'arisan-sports-bra-2026-09-03.glb',
    slug: 'r-asb',
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
 * S3 credentials from the Cloudflare API token: Access Key ID is the token's `id`,
 * Secret Access Key is the SHA-256 of the token value
 * (developers.cloudflare.com/r2/api/tokens/#get-s3-api-credentials-from-an-api-token).
 * The id is fetched rather than passed in, so only the token itself is ever a secret.
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

/** Recorded size for an archive key, from the manifest the nightly check also reads. */
function recordedBytes(key) {
  const manifest = JSON.parse(readFileSync(join(here, 'archive-manifest.json'), 'utf8'))
  const row = manifest.objects.find((o) => o.key === key)
  if (!row)
    throw new Error(`"${key}" is not in scripts/archive-manifest.json — refusing to guess its size`)
  return row.bytes
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--list')) {
    for (const [name, g] of Object.entries(GARMENTS))
      console.log(`${name}\t${g.slug}\t${g.archive}`)
    return
  }
  const name = args.find((a) => !a.startsWith('--'))
  const garment = GARMENTS[name]
  if (!garment) {
    console.error(`Unknown garment "${name}". Run with --list to see the eleven.`)
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')
  const copyOnly = args.includes('--copy-only')
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required (read it from ~/cf_token.txt)')

  const archiveKey = `${ARCHIVE_PREFIX}/${garment.archive}`
  const expected = recordedBytes(archiveKey)
  const endpoint = accountEndpoint()
  const aws = await s3Client(token)
  const url = (bucket, key) => `${endpoint}/${bucket}/${enc(key)}`

  console.log(`[ingest] ${name} → ${garment.slug}`)
  console.log(`[ingest]   archive: ${archiveKey}`)
  console.log(
    `[ingest]   ingest:  ${garment.file}  (${(expected / 1048576).toFixed(1)} MB expected)`,
  )

  // 1. The source must be there at the size the manifest recorded. A copy of the
  //    wrong object is worse than no copy: the robot would succeed on a stale file.
  const srcHead = await aws.fetch(url(ARCHIVE_BUCKET, archiveKey), { method: 'HEAD' })
  if (srcHead.status !== 200)
    throw new Error(`archive object HEAD ${srcHead.status} for "${archiveKey}"`)
  const srcBytes = Number(srcHead.headers.get('content-length'))
  if (srcBytes !== expected)
    throw new Error(`archive object is ${srcBytes} bytes, manifest says ${expected}`)
  console.log(`[ingest]   source OK — ${srcBytes} bytes, etag ${srcHead.headers.get('etag')}`)

  if (dryRun) {
    console.log('[ingest] --dry-run: stopping before the copy.')
    return
  }

  // 2. Copy inside Cloudflare. Idempotent: an object already there at the right
  //    size is left alone, so a re-run after a failed enqueue costs nothing.
  const dstHead = await aws.fetch(url(INGEST_BUCKET, garment.file), { method: 'HEAD' })
  if (dstHead.status === 200 && Number(dstHead.headers.get('content-length')) === expected) {
    console.log('[ingest]   already in the ingest bucket at the right size — skipping the copy')
  } else {
    const t0 = Date.now()
    const copy = await aws.fetch(url(INGEST_BUCKET, garment.file), {
      method: 'PUT',
      headers: {
        'x-amz-copy-source': `/${ARCHIVE_BUCKET}/${enc(archiveKey)}`,
        'x-amz-metadata-directive': 'REPLACE',
        'content-type': 'model/gltf-binary',
      },
    })
    const copyBody = await copy.text()
    if (copy.status !== 200) throw new Error(`CopyObject ${copy.status}: ${copyBody.slice(0, 400)}`)
    const etag = (copyBody.match(/<ETag>&quot;?([^<&]+)/) || [])[1]
    console.log(`[ingest]   copied in ${((Date.now() - t0) / 1000).toFixed(1)}s, etag ${etag}`)

    const after = await aws.fetch(url(INGEST_BUCKET, garment.file), { method: 'HEAD' })
    const gotBytes = Number(after.headers.get('content-length'))
    if (after.status !== 200 || gotBytes !== expected) {
      throw new Error(
        `ingest object is ${after.status} / ${gotBytes} bytes, expected 200 / ${expected}`,
      )
    }
    console.log(`[ingest]   verified in ingest — ${gotBytes} bytes`)
  }

  if (copyOnly) {
    console.log('[ingest] --copy-only: the object is in place; no shrink job started.')
    return
  }

  // 3. Resolve the product by slug. Never hardcode the id: the CMS holds 67 products
  //    and two renames have already broken a derived key on this project.
  const apiKey = process.env.CMS_API_KEY
  if (!apiKey) throw new Error('CMS_API_KEY is required to create the raw-upload document')
  const auth = { Authorization: `users API-Key ${apiKey}` }
  const lookup = await fetch(
    `${CMS_ORIGIN}/api/products?where[slug][equals]=${encodeURIComponent(garment.slug)}&depth=0&limit=1`,
    { headers: { ...auth, accept: 'application/json' } },
  )
  const found = await lookup.json()
  const product = found?.docs?.[0]
  if (!product) throw new Error(`no product with slug "${garment.slug}"`)
  console.log(`[ingest]   product #${product.id} — ${product.productName} [${product.status}]`)

  // 4. Create the raw-upload document the way the browser does.
  const form = new FormData()
  form.append('_payload', JSON.stringify({ targetProduct: product.id }))
  form.append(
    'file',
    JSON.stringify({
      clientUploadContext: { prefix: '' },
      collectionSlug: 'raw-uploads',
      filename: garment.file,
      mimeType: 'model/gltf-binary',
      size: expected,
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
