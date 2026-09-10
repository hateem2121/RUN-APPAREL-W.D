/**
 * Remove root `extras` from an ALREADY-PROCESSED GLB, without re-rendering it.
 *
 * WHY THIS EXISTS SEPARATELY FROM `stripRootExtras`. That transform fixes the
 * pipeline, so every future garment ships clean. It cannot help the eleven models
 * already published — and re-running the pipeline on them is not an option:
 *
 *   - "Never run the pipeline on its own output" (root CLAUDE.md). Meshopt has
 *     quantized the vertex attributes, and `simplify-textured.ts` bails to a
 *     position-only fallback when it sees them, SILENTLY losing artwork protection.
 *   - Re-processing from the raw exports would work — all eleven are on disk and in
 *     R2 — but it is eleven container jobs and eleven manual admin attaches, and any
 *     re-render can change how a garment looks.
 *
 * So this rewrites the JSON chunk and nothing else. No decoder, no encoder, no
 * decimator, no meshopt — which is exactly why the trap above does not apply: it is
 * a text edit inside a container format, and the geometry bytes are copied verbatim.
 *
 * ⚠️ IT TRUNCATES RATHER THAN PADS, and the reason is legibility rather than speed.
 * `repair-dead-textures.ts` — the module this is modelled on — space-pads the JSON
 * chunk back to its original length so no offset moves. That is the safest possible
 * edit, and it leaves the file the same size, so a later inspection cannot tell
 * whether the strip ran. The wire saving of truncating is close to zero anyway
 * (Cloudflare compresses this host, and 434 KB of spaces gzips to almost nothing) —
 * what truncation buys is a file whose size states plainly that it happened.
 *
 * The offsets are safe because accessor `byteOffset`s are relative to the BIN chunk,
 * not to the file: shifting the BIN chunk earlier changes nothing inside it. Only
 * the JSON chunk length and the total length are rewritten.
 *
 * ⚠️ VERIFY ON THE LIVE OBJECT, NOT THE LOCAL OUTPUT. A ranged GET of the first
 * megabyte reads the JSON chunk; the 2026-09-05 product-page audit records
 * why local output is not evidence about what is being served.
 */
import { createHash } from 'node:crypto'

/** GLB: 12-byte header, then chunks of [uint32 length][uint32 type][payload]. */
const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a // 'JSON'
const CHUNK_BIN = 0x004e4942 // 'BIN\0'
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8

export interface StripLiveResult {
  /** Bytes before and after. Equal only when there was nothing to remove. */
  before: number
  after: number
  /** Top-level `extras` keys removed. */
  removedKeys: string[]
  /** SHA-256 of the BIN chunk. MUST be identical before and after. */
  binSha256: string
  /** Whether a copyright was added (never overwritten). */
  copyrightSet: boolean
}

function readChunks(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < HEADER_BYTES || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('strip-live-metadata: not a GLB (bad magic)')
  }
  let offset = HEADER_BYTES
  let json: { start: number; length: number } | null = null
  let bin: { start: number; length: number } | null = null
  while (offset + CHUNK_HEADER_BYTES <= bytes.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + CHUNK_HEADER_BYTES
    if (type === CHUNK_JSON && !json) json = { start, length }
    if (type === CHUNK_BIN && !bin) bin = { start, length }
    offset = start + length
  }
  if (!json) throw new Error('strip-live-metadata: no JSON chunk')
  return { json, bin }
}

/** Pad to the 4-byte boundary the GLB spec requires, with spaces (valid JSON). */
function padJson(encoded: Uint8Array): Uint8Array {
  const remainder = encoded.byteLength % 4
  if (remainder === 0) return encoded
  const padded = new Uint8Array(encoded.byteLength + (4 - remainder))
  padded.set(encoded)
  padded.fill(0x20, encoded.byteLength)
  return padded
}

/**
 * @param bytes      The whole GLB.
 * @param copyright  Written to `asset.copyright` when absent. `null` to skip.
 */
export function stripLiveMetadata(
  bytes: Uint8Array,
  copyright: string | null,
): { output: Uint8Array; result: StripLiveResult } {
  const { json, bin } = readChunks(bytes)
  const binBytes = bin ? bytes.subarray(bin.start, bin.start + bin.length) : new Uint8Array()
  const binSha256 = createHash('sha256').update(binBytes).digest('hex')

  const source = new TextDecoder().decode(bytes.subarray(json.start, json.start + json.length))
  const doc = JSON.parse(source) as {
    extras?: Record<string, unknown>
    asset: { copyright?: string }
  }

  const removedKeys = doc.extras ? Object.keys(doc.extras) : []
  // `delete`, not `= undefined`: this package sets `exactOptionalPropertyTypes`, so
  // assigning undefined to an optional property is a type error — and it would also
  // serialise nothing while leaving the key present in some engines.
  if (removedKeys.length > 0) delete doc.extras

  let copyrightSet = false
  if (copyright !== null && copyright.length > 0 && !doc.asset.copyright) {
    doc.asset.copyright = copyright
    copyrightSet = true
  }

  if (removedKeys.length === 0 && !copyrightSet) {
    return {
      output: bytes,
      result: {
        before: bytes.byteLength,
        after: bytes.byteLength,
        removedKeys,
        binSha256,
        copyrightSet,
      },
    }
  }

  const encoded = padJson(new TextEncoder().encode(JSON.stringify(doc)))
  const binTotal = bin ? CHUNK_HEADER_BYTES + bin.length : 0
  const total = HEADER_BYTES + CHUNK_HEADER_BYTES + encoded.byteLength + binTotal

  const output = new Uint8Array(total)
  const out = new DataView(output.buffer)
  out.setUint32(0, GLB_MAGIC, true)
  out.setUint32(4, 2, true) // glTF version 2
  out.setUint32(8, total, true)
  out.setUint32(12, encoded.byteLength, true)
  out.setUint32(16, CHUNK_JSON, true)
  output.set(encoded, HEADER_BYTES + CHUNK_HEADER_BYTES)
  if (bin) {
    const binChunkStart = HEADER_BYTES + CHUNK_HEADER_BYTES + encoded.byteLength
    out.setUint32(binChunkStart, bin.length, true)
    out.setUint32(binChunkStart + 4, CHUNK_BIN, true)
    // Verbatim. This is the whole safety argument: the geometry is copied, never
    // decoded and re-encoded, so meshopt quantization is untouched.
    output.set(binBytes, binChunkStart + CHUNK_HEADER_BYTES)
  }

  return {
    output,
    result: { before: bytes.byteLength, after: total, removedKeys, binSha256, copyrightSet },
  }
}

/** SHA-256 of a finished file's BIN chunk, for the before/after comparison. */
export function binChunkSha256(bytes: Uint8Array): string {
  const { bin } = readChunks(bytes)
  const binBytes = bin ? bytes.subarray(bin.start, bin.start + bin.length) : new Uint8Array()
  return createHash('sha256').update(binBytes).digest('hex')
}
