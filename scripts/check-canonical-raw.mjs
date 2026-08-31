/**
 * Re-check every raw garment export against `raw/CANONICAL.json` — L20-07.
 *
 * WHY. The canonical raw exports are LOCAL by owner decision (2026-08-07), and the
 * R2 ingest bucket that briefly held them expires everything after 14 days and is in
 * no backup. So the only thing standing between "this is the file the pipeline was
 * calibrated against" and "this is a file with the same name" is a fingerprint.
 *
 * Until 2026-08-31 the manifest recorded ONE garment while ten sat on the disk, so
 * nine had no fingerprint at all: a re-export from CLO, a partial copy, or a
 * half-finished download would all have been undetectable, and would have produced a
 * perfectly plausible damage number for the wrong file. That is the same
 * silent-wrong-input failure as the `crop-chest` camera mistake recorded in
 * `eval-artwork-real.mjs`.
 *
 * WHAT A PASS DOES AND DOES NOT MEAN. A pass says the bytes are unchanged. It says
 * nothing about whether a garment is good — only `n001` has ever been calibrated,
 * and every other entry carries `calibrated: false` for exactly that reason.
 *
 *   node scripts/check-canonical-raw.mjs            # verify, exit 1 on any mismatch
 *   node scripts/check-canonical-raw.mjs --list     # print the manifest, verify nothing
 *
 * ⚠️ NOT A CI GATE, and it cannot become one: a GitHub runner has no access to this
 * laptop's disk. That is the accepted consequence of the local-only decision, and it
 * is why the monthly `eval:artwork:real` workflow was deleted rather than left to
 * fail every month. Run it by hand before trusting a calibration number.
 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const MANIFEST = new URL('../raw/CANONICAL.json', import.meta.url)

/** Stream the file — these are up to 382 MB and must not be read into memory. */
export function sha256OfFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * Compare one manifest entry against the disk.
 *
 * `missing` is deliberately NOT a failure. These files are local by design and a
 * second machine legitimately has none of them; failing there would train whoever
 * runs this to ignore it. A file that is PRESENT and DIFFERENT is the real signal.
 */
export async function checkGarment(name, entry, { root = REPO_ROOT } = {}) {
  // join, NOT `new URL(relative, root)` — root is a filesystem path, and URL needs a
  // file:// base. The first version threw ERR_INVALID_URL on the very first entry.
  const path = isAbsolute(entry.localFile) ? entry.localFile : join(root, entry.localFile)
  if (!existsSync(path)) return { name, status: 'missing', path }

  const bytes = statSync(path).size
  if (entry.bytes !== undefined && bytes !== entry.bytes) {
    return { name, status: 'size-mismatch', path, expected: entry.bytes, actual: bytes }
  }

  const sha256 = await sha256OfFile(path)
  if (sha256 !== entry.sha256) {
    return { name, status: 'hash-mismatch', path, expected: entry.sha256, actual: sha256 }
  }
  return { name, status: 'ok', path, bytes, calibrated: entry.calibrated !== false }
}

/** Split results into the three outcomes the exit code depends on. */
export function summarise(results) {
  const mismatched = results.filter((r) => r.status.endsWith('mismatch'))
  const missing = results.filter((r) => r.status === 'missing')
  const ok = results.filter((r) => r.status === 'ok')
  return { mismatched, missing, ok, allPresentAreIntact: mismatched.length === 0 }
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  const garments = Object.entries(manifest.garments)

  if (process.argv.includes('--list')) {
    for (const [name, entry] of garments) {
      const cal = entry.calibrated === false ? 'not calibrated' : 'CALIBRATED'
      console.log(`  ${name.padEnd(24)} ${String(entry.bytes).padStart(12)} B  ${cal}`)
      console.log(`  ${''.padEnd(24)} ${entry.localFile}`)
    }
    console.log(`\n[check-canonical-raw] ${garments.length} garments in the manifest.`)
    return
  }

  console.log(`[check-canonical-raw] verifying ${garments.length} garments (streaming sha256)…`)
  const results = []
  for (const [name, entry] of garments) results.push(await checkGarment(name, entry))

  for (const r of results) {
    const mark = r.status === 'ok' ? 'ok  ' : r.status === 'missing' ? '--  ' : 'FAIL'
    console.log(`  ${mark} ${r.name.padEnd(24)} ${r.status}`)
    if (r.status.endsWith('mismatch')) {
      console.error(`::error::${r.name}: expected ${r.expected}, found ${r.actual} (${r.path})`)
    }
  }

  const { mismatched, missing, ok } = summarise(results)
  console.log(
    `\n[check-canonical-raw] ${ok.length} intact, ${missing.length} absent from this machine, ${mismatched.length} CHANGED.`,
  )
  if (missing.length) {
    console.log(
      '  Absent is not a failure — these files are local by design (see raw/CANONICAL.json).',
    )
  }
  if (mismatched.length) {
    console.error(
      '\n  A changed file is not the file any calibration was measured against. Re-run ' +
        'eval:artwork:real --calibrate, LOOK at the contact sheets, and update `ceiling` ' +
        'and `calibratedAt` together — or restore the original.',
    )
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
}
