#!/usr/bin/env node
/**
 * After `next build`: where the build wrote the SAME server chunk more than once, keep one copy
 * and make the others load it.
 *
 *   node scripts/one-copy-of-each-chunk.mjs            # rewrites .next/server/chunks in place
 *   node scripts/one-copy-of-each-chunk.mjs --dry-run  # prints what it would do, changes nothing
 *
 * WHY (21 Nov 2026, the owner's "start building a smaller site Worker"). The site's Worker is one
 * 29.2 MB file, and a fresh copy of it takes about a second to load before any code runs
 * (`wrangler check startup`: 31 ms of start-up code; the rest is loading). esbuild's own size
 * report for that file (handler.mjs.meta.json) showed one 2.3 MB chunk in it FIVE times: the CMS
 * core, the database adapter and the site's page lists. Three of the copies were byte-identical
 * apart from the 13-byte `sourceMappingURL` comment on their last line, and so were the other
 * two: Turbopack writes one copy per group of routes that needs the code (the form handlers, the
 * CMS API, the sitemap and feeds, the Russian pages, the admin). 6.9 MB of 29.2 MB, 24%, was the
 * same bytes again.
 *
 * HOW. A Turbopack server chunk is `module.exports=[id, factory, id, factory, …]`, and the runtime
 * `require`s it and registers each factory under its id. Two chunks with the same bytes register
 * the same factories under the same ids, so a duplicate can simply BE the first one:
 * `module.exports=require("./first.js")`. OpenNext then bundles the code once.
 *
 * ⚠️ ONLY FILES THAT ARE THE SAME BYTE FOR BYTE once the `sourceMappingURL` line is set aside. A
 * chunk that is merely similar (the page-side and server-side builds of the same code share no
 * module ids) is never touched. The comparison is the whole file's SHA-256, not its size.
 *
 * It prints counts and sizes only, and exits 1 if a rewritten file would not parse.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Smaller duplicates than this are left alone: the saving would not be worth a second file read. */
export const MIN_BYTES = 50_000

const SOURCE_MAP_LINE = /\s*\/\/# sourceMappingURL=[^\n]*\s*$/

/** A chunk's code without its last-line source map comment, which names the file itself. */
export function withoutSourceMapLine(text) {
  return text.replace(SOURCE_MAP_LINE, '')
}

/** The stub a duplicate becomes: the first copy, by a relative path Node and esbuild both resolve. */
export function stubFor(fromFile, firstFile) {
  let path = relative(dirname(fromFile), firstFile).split(sep).join('/')
  if (!path.startsWith('.')) path = `./${path}`
  return `module.exports=require(${JSON.stringify(path)});\n`
}

/** Is this already a stub written by an earlier run? (The build is not always from scratch.) */
export function isStub(text) {
  return /^module\.exports=require\("[^"]+"\);\n?$/.test(text)
}

/**
 * Which files to rewrite, from `{ file, text }` records: every group of two or more with the same
 * code keeps its first file (by name, so the choice is the same on every machine).
 *
 * @param {Array<{ file: string, text: string }>} chunks
 * @returns {Array<{ first: string, copies: string[], bytes: number }>}
 */
export function duplicateGroups(chunks, minBytes = MIN_BYTES) {
  const groups = new Map()
  for (const { file, text } of chunks) {
    if (isStub(text)) continue
    const code = withoutSourceMapLine(text)
    if (Buffer.byteLength(code) < minBytes) continue
    // Only the shape described above: anything else is not ours to redirect.
    if (!code.startsWith('module.exports=[')) continue
    const key = createHash('sha256').update(code).digest('hex')
    const group = groups.get(key) ?? { files: [], bytes: Buffer.byteLength(code) }
    group.files.push(file)
    groups.set(key, group)
  }
  return [...groups.values()]
    .filter((group) => group.files.length > 1)
    .map((group) => {
      const [first, ...copies] = [...group.files].sort()
      return { first, copies, bytes: group.bytes }
    })
    .sort((a, b) => b.bytes * b.copies.length - a.bytes * a.copies.length)
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  )

/**
 * The folders a build leaves server chunks in. OpenNext bundles the Worker from the STANDALONE
 * copy (`.next/standalone/…`, written at the end of `next build` when OpenNext runs it); `next
 * start` and the tests read `.next/server`. Each is handled by itself: a stub only ever points
 * at a file in its own folder.
 */
export function chunkFolders(cmsRoot) {
  return [
    join(cmsRoot, '.next', 'server', 'chunks'),
    join(cmsRoot, '.next', 'standalone', 'apps', 'cms', '.next', 'server', 'chunks'),
  ]
}

const exists = (dir) => {
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
}

function main(args) {
  const dryRun = args.includes('--dry-run')
  const folders = chunkFolders(join(import.meta.dirname, '..')).filter(exists)
  if (folders.length === 0) {
    console.error('[one-copy] no .next/server/chunks: run `next build` first')
    return 1
  }
  const kib = (n) => `${Math.round(n / 1024).toLocaleString('en-US')} KiB`
  for (const chunksDir of folders) {
    const chunks = walk(chunksDir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => ({ file, text: readFileSync(file, 'utf8') }))
    const groups = duplicateGroups(chunks)
    let saved = 0
    let rewritten = 0
    for (const { first, copies, bytes } of groups) {
      for (const copy of copies) {
        const stub = stubFor(copy, first)
        if (!isStub(stub)) {
          console.error('[one-copy] a stub did not come out in the expected shape; stopping')
          return 1
        }
        if (!dryRun) writeFileSync(copy, stub)
        saved += bytes - Buffer.byteLength(stub)
        rewritten += 1
      }
    }
    const where = chunksDir.includes(`${sep}standalone${sep}`) ? 'standalone' : 'server'
    console.log(
      `[one-copy] ${where}: ${chunks.length} server chunks, ${groups.length} repeated; ${rewritten} copies ${dryRun ? 'would be' : 'were'} replaced, ${kib(saved)} less to bundle`,
    )
  }
  return 0
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2))
}
