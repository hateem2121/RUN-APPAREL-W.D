#!/usr/bin/env node
/**
 * List Media documents nothing points at — and, only when explicitly asked,
 * delete them.
 *
 * USAGE
 *   CMS_API_KEY=... node scripts/find-orphan-media.mjs [--delete] [--yes]
 *                                                      [--url https://cms.wear-run.help]
 *
 * WHY THIS EXISTS. Until this session, every re-run of a shrink job created a
 * brand-new Media document and overwrote the raw upload's `resultGlb`, leaving
 * the previous document and its object in the PUBLIC bucket with nothing
 * referencing it and nothing ever cleaning it up. That leak is fixed in
 * apps/shrink/src/index.ts, but the files it already produced are still there.
 *
 * DRY RUN BY DEFAULT. It prints what it would remove and exits. `--delete`
 * still asks for confirmation unless `--yes` is also given, because this is an
 * irreversible operation against production media and the whole point of the
 * bug it cleans up is that it was hard to see.
 *
 * The reference list is deliberately the same one the shrink Worker uses
 * (MEDIA_REFERENCE_PATHS in apps/shrink/src/cms.ts). If a Media relationship
 * is added to a collection, it must be added in BOTH places, or this will report
 * a live asset as an orphan.
 */
import { createInterface } from 'node:readline/promises'

const REFERENCE_PATHS = ['glbAsset', 'posterFallback', 'colourways.posterPreview', 'colourways.glbAsset']

function parseArgs(argv) {
  const options = { delete: false, yes: false, url: process.env.CMS_URL ?? 'https://cms.wear-run.help' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--delete') options.delete = true
    else if (argv[i] === '--yes') options.yes = true
    else if (argv[i] === '--url') options.url = argv[++i]
  }
  return options
}

function fail(message) {
  console.error(`\nERROR: ${message}\n`)
  process.exit(1)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const apiKey = process.env.CMS_API_KEY
  if (!apiKey) {
    fail(
      'CMS_API_KEY is not set.\n' +
        '  Create an API key on an admin user in the CMS, then:\n' +
        '    export CMS_API_KEY=...',
    )
  }
  const base = options.url.replace(/\/$/, '')

  const request = async (path) => {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `users API-Key ${apiKey}`, accept: 'application/json' },
    })
    if (!res.ok) fail(`${path} returned ${res.status}`)
    return res.json()
  }

  // 1. Every Media doc, paged.
  const media = []
  for (let page = 1; ; page++) {
    const json = await request(`/api/media?limit=100&depth=0&page=${page}`)
    media.push(...(json.docs ?? []))
    if (!json.hasNextPage) break
  }
  console.log(`${media.length} media document(s) in ${base}`)

  // 2. Every id referenced by a product or a raw upload. Collected up front, in
  //    two queries, rather than one query per media doc — a per-doc check on a
  //    few hundred files is slow enough that someone would be tempted to skip it.
  const referenced = new Set()
  const noteReference = (value) => {
    if (value == null) return
    referenced.add(String(typeof value === 'object' ? (value.id ?? '') : value))
  }

  for (let page = 1; ; page++) {
    const json = await request(`/api/products?limit=100&depth=0&page=${page}`)
    for (const product of json.docs ?? []) {
      noteReference(product.glbAsset)
      noteReference(product.posterFallback)
      for (const colourway of product.colourways ?? []) {
        noteReference(colourway.posterPreview)
        noteReference(colourway.glbAsset)
      }
    }
    if (!json.hasNextPage) break
  }

  for (let page = 1; ; page++) {
    const json = await request(`/api/raw-uploads?limit=100&depth=0&page=${page}`)
    for (const upload of json.docs ?? []) noteReference(upload.resultGlb)
    if (!json.hasNextPage) break
  }

  const orphans = media.filter((doc) => !referenced.has(String(doc.id)))
  console.log(`${referenced.size} referenced, ${orphans.length} unreferenced.\n`)

  if (orphans.length === 0) {
    console.log('Nothing to clean up.')
    return
  }

  let bytes = 0
  for (const doc of orphans) {
    bytes += doc.filesize ?? 0
    const size = doc.filesize ? `${(doc.filesize / 1024 / 1024).toFixed(1)} MB` : '?'
    console.log(`  #${String(doc.id).padStart(4)}  ${size.padStart(9)}  ${doc.filename ?? '(no filename)'}`)
  }
  console.log(`\n  total: ${(bytes / 1024 / 1024).toFixed(1)} MB`)

  if (!options.delete) {
    console.log('\nDry run — nothing was deleted. Re-run with --delete to remove these.')
    console.log('Check the list first: anything an editor uploaded by hand and has not attached yet')
    console.log('will also appear here, and deleting it is not recoverable.')
    return
  }

  if (!options.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(`\nPermanently delete these ${orphans.length} file(s)? [y/N] `)
    rl.close()
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('Cancelled — nothing was deleted.')
      return
    }
  }

  let deleted = 0
  for (const doc of orphans) {
    const res = await fetch(`${base}/api/media/${doc.id}`, {
      method: 'DELETE',
      headers: { Authorization: `users API-Key ${apiKey}` },
    })
    if (res.ok) {
      deleted++
      console.log(`  deleted #${doc.id}`)
    } else {
      console.error(`  FAILED  #${doc.id} (${res.status})`)
    }
  }
  console.log(`\nDeleted ${deleted}/${orphans.length}.`)
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
