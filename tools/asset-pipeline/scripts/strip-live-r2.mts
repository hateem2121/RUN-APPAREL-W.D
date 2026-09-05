/**
 * Strip CLO's factory metadata from the ELEVEN ALREADY-PUBLISHED models, in place.
 *
 * Owner approved 2026-09-05. Background and the full list of what leaks:
 * `tools/asset-pipeline/src/strip-root-extras.ts` and
 * `docs/AUDIT-PRODUCT-PAGES-2026-09-05.md` → PP3-N-01.
 *
 * ⚠️ THIS IS NOT "RUNNING THE PIPELINE ON ITS OWN OUTPUT", and the distinction is
 * the whole safety argument. The root CLAUDE.md forbids that because meshopt has
 * quantized the vertex attributes and `simplify-textured.ts` silently drops to a
 * position-only fallback when it sees them, losing artwork protection. Nothing here
 * decodes geometry: `stripLiveMetadata` rewrites the JSON chunk and copies the BIN
 * chunk byte for byte. The BIN sha256 is compared before and after on every file and
 * a mismatch aborts the whole run.
 *
 * ⚠️ IT OVERWRITES THE SAME R2 KEY, deliberately. The alternative — eleven new Media
 * documents and eleven manual admin attaches — puts eleven chances to attach the
 * wrong model in front of a non-technical owner, which is the exact 2026-08-09 defect
 * `attach.ts` was written to end. Overwriting means no Media doc, no URL, no product
 * and no CMS record changes at all.
 *
 * ⚠️ AND IT MUST PURGE THE EDGE. The objects are served `max-age=31536000` behind a
 * Cloudflare cache rule, so a fresh object is invisible until that URL is purged.
 * This script does not purge — it prints the URLs to purge and REFUSES to claim
 * success on the live edge. Verify with a plain GET, never a HEAD: `HEAD` and `GET`
 * land on different edge cache entries on this domain (root CLAUDE.md, measured
 * twice in both directions).
 *
 * Usage:
 *   pnpm tsx scripts/strip-live-r2.mts --dry-run            # download, strip, verify
 *   pnpm tsx scripts/strip-live-r2.mts --only rxps          # one garment
 *   pnpm tsx scripts/strip-live-r2.mts --apply              # upload
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { binChunkSha256, stripLiveMetadata } from '../src/strip-live-metadata'
import { ASSET_COPYRIGHT } from '../src/strip-root-extras'

const BUCKET = 'run-apparel-viewer-media'
const WRANGLER = 'wrangler@4.122.0'
/** Read off the live objects before the first write, so nothing is invented. */
const CONTENT_TYPE = 'model/gltf-binary'
const CACHE_CONTROL = 'max-age=31536000'

/** slug → R2 key. Resolved from the live API on 2026-09-05, never guessed. */
const MODELS: Record<string, string> = {
  'r-afp': 'apex-flex-pullover-2026-09-03-optimized.glb',
  'r-aj': 'the-aggressor-jersey-2026-09-03-optimized.glb',
  'r-ajm': 'the-aggressor-jersey-men-2026-09-03-optimized.glb',
  'r-asb': 'arisan-sports-bra-2026-09-03-optimized.glb',
  'r-atj': 'armor-tech-jacket-2026-09-03-optimized.glb',
  'r-atw': 'aero-tech-windbreaker-2026-09-03-optimized.glb',
  'r-css': 'classic-soccer-shirt-2026-09-03-optimized.glb',
  'r-mm': 'minecut-motion-2026-09-03-optimized.glb',
  'r-wzu': 'women-zip-up-vest-2026-09-03-optimized.glb',
  'r-xmp': 'x-milo-pro-bib-2026-09-03-optimized.glb',
  rxps: 'x-milo-pro-skin-suit-2026-09-03-optimized.glb',
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const onlyIndex = args.indexOf('--only')
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null

function wrangler(argv: string[]): void {
  execFileSync('npx', ['--yes', WRANGLER, ...argv], { stdio: 'pipe', encoding: 'utf8' })
}

/** The root `extras` still present in a finished file, read from the JSON chunk. */
function rootExtrasKeys(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = view.getUint32(12, true)
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)))
  return doc.extras ? Object.keys(doc.extras) : []
}

function assetCopyright(bytes: Uint8Array): string | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = view.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))).asset?.copyright
}

const scratch = mkdtempSync(join(tmpdir(), 'strip-live-'))
const entries = Object.entries(MODELS).filter(([slug]) => !only || slug === only)
if (entries.length === 0) throw new Error(`--only ${only} matches no garment`)

console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${entries.length} garment(s), scratch ${scratch}\n`)

let totalSaved = 0
const purge: string[] = []

for (const [slug, key] of entries) {
  const original = join(scratch, `${slug}.orig.glb`)
  const stripped = join(scratch, `${slug}.strip.glb`)

  // Straight from R2, NOT from media.wear-run.help: the edge copy may be a cached
  // older object, and this must read what is actually stored.
  wrangler(['r2', 'object', 'get', `${BUCKET}/${key}`, '--file', original, '--remote'])
  const before = new Uint8Array(readFileSync(original))
  const { output, result } = stripLiveMetadata(before, ASSET_COPYRIGHT)

  // ── The three proofs, every file, before anything is uploaded ──────────────
  const binBefore = binChunkSha256(before)
  const binAfter = binChunkSha256(output)
  if (binBefore !== binAfter) {
    throw new Error(`${slug}: BIN CHUNK CHANGED (${binBefore} → ${binAfter}) — aborting run`)
  }
  const leftover = rootExtrasKeys(output)
  if (leftover.length > 0) throw new Error(`${slug}: root extras survived: ${leftover.join(', ')}`)
  const copyright = assetCopyright(output)
  if (!copyright) throw new Error(`${slug}: no asset.copyright after strip`)

  writeFileSync(stripped, output)
  const saved = result.before - result.after
  totalSaved += saved
  console.log(
    `  ${slug.padEnd(6)} ${String(result.before).padStart(10)} → ${String(result.after).padStart(10)} B ` +
      `(−${String(saved).padStart(7)})  removed=[${result.removedKeys.join(',') || '—'}] ` +
      `copyright=${result.copyrightSet ? 'added' : 'kept'}  bin=${binAfter.slice(0, 12)} ✓`,
  )

  if (!apply) continue

  wrangler([
    'r2',
    'object',
    'put',
    `${BUCKET}/${key}`,
    '--file',
    stripped,
    '--content-type',
    CONTENT_TYPE,
    '--cache-control',
    CACHE_CONTROL,
    '--remote',
  ])

  // Read the STORED object back. An upload that reports success and stores
  // something else is exactly the failure the audit's own CMS-write finding
  // records ("a write that 200s and stores nothing").
  const roundTrip = join(scratch, `${slug}.readback.glb`)
  wrangler(['r2', 'object', 'get', `${BUCKET}/${key}`, '--file', roundTrip, '--remote'])
  const stored = new Uint8Array(readFileSync(roundTrip))
  if (stored.byteLength !== output.byteLength) {
    throw new Error(`${slug}: stored ${stored.byteLength} B, uploaded ${output.byteLength} B`)
  }
  if (binChunkSha256(stored) !== binAfter) throw new Error(`${slug}: stored BIN chunk differs`)
  if (rootExtrasKeys(stored).length > 0) throw new Error(`${slug}: stored object still has extras`)
  console.log(`         ↑ uploaded and read back: ${stored.byteLength} B, BIN identical ✓`)
  purge.push(`https://media.wear-run.help/${key}`)
}

console.log(`\n${apply ? 'Applied' : 'Would remove'} ${totalSaved.toLocaleString()} bytes total.`)
if (purge.length > 0) {
  console.log('\n⚠️ THE EDGE STILL SERVES THE OLD OBJECT until these URLs are purged:')
  for (const url of purge) console.log(`   ${url}`)
  console.log('\nAfter purging, verify with a plain GET (never HEAD — different cache entry).')
}
