import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * ⚠️ RETIRED 2026-09-05 — THIS NO LONGER PRODUCES THE SHIPPED FILE, AND RUNNING
 * IT WOULD MAKE THE GARMENTS FLAT AGAIN. It refuses to overwrite unless you pass
 * `--force`. Kept, not deleted, because its RGBE encoder and its round-trip
 * decoder are the only Radiance codec in this repo and the downsampler that
 * produced the current map was built from them.
 *
 * `public/env/studio-soft.hdr` is now Poly Haven's `studio_small_09` — CC0, no
 * attribution required — box-downsampled in LINEAR space to 256x128.
 *
 * WHY IT WAS REPLACED, measured on the live rxps garment at a fixed camera and
 * exposure, mean absolute pixel difference against the same scene lit by the
 * full 1024x512 original:
 *
 *     256x128 downsample   0.54/255   max  10     <- what ships
 *     512x256 downsample   0.27/255   max   5
 *     THIS placeholder    11.38/255   max  65     <- 21x further away
 *
 * The placeholder is a smooth analytic gradient, so it lit the garment almost
 * flat: no chest curvature, no shadow under the bust, no leg volume. That is not
 * only a quality problem — it is part of why the owner reported on 2026-09-04
 * that "on first glance it looks like an image". A photograph of a real softbox
 * rig puts form back on the body.
 *
 * ⚠️ AND THE REPLACEMENT IS SMALLER: 100,649 bytes against this script's 135,171,
 * on a file that is `<link rel="preload">`ed on every visit. That is not a
 * trade — it is better lighting for 34 KB less on the critical path. It works
 * because RLE compresses an analytic gradient beautifully and a photograph
 * hardly at all, so dropping to a quarter of the pixels more than pays for the
 * detail. 256x128 is enough because a rough, non-metallic fabric integrates the
 * environment into near-irradiance anyway; the 0.54/255 above is that claim
 * measured rather than asserted.
 *
 * An UltraHDR (.jpg) map would be smaller again — model-viewer's own docs quote
 * 10-30x over .hdr, via https://gainmap-creator.monogrid.com — but that is a
 * browser-side conversion nobody has run yet, and it is no longer urgent now
 * that the file is under its old size.
 *
 *   node apps/viewer/scripts/gen-env-hdr.mjs --force
 *
 * Output is Radiance RGBE, new-format RLE (exactly what three.js RGBELoader,
 * which model-viewer uses, expects). The script round-trips the file it writes
 * and exits non-zero if the encoding does not decode back byte-for-byte.
 */

const W = 512
const H = 256

/** Soft studio radiance at equirectangular (u: longitude 0..1, v: latitude top→bottom 0..1). */
function radiance(u, v) {
  const up = Math.cos(v * Math.PI) // +1 top, −1 bottom
  const base = 0.55 + 0.85 * Math.max(0, up)
  let r = base * 1.02
  let g = base * 1.0
  let b = base * 0.98
  // Two soft key lights near the top — front (u≈0.25) and back (u≈0.75).
  for (const cu of [0.25, 0.75]) {
    let du = Math.abs(u - cu)
    du = Math.min(du, 1 - du)
    const dv = v - 0.28
    const key = Math.exp(-((du * du) / 0.0036 + (dv * dv) / 0.0256)) * 3.2
    r += key
    g += key
    b += key * 0.98
  }
  // Subtle cool floor bounce.
  const floor = Math.max(0, -up) * 0.18
  return [r + floor * 0.9, g + floor * 0.95, b + floor]
}

function toRGBE(r, g, b) {
  const m = Math.max(r, g, b)
  if (m < 1e-32) return [0, 0, 0, 0]
  const e = Math.ceil(Math.log2(m))
  const scale = 256 / 2 ** e
  const clamp = (x) => Math.min(255, Math.max(0, Math.floor(x * scale)))
  return [clamp(r), clamp(g), clamp(b), e + 128]
}

// Build the RGBE plane.
const planes = new Uint8Array(W * H * 4)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const [r, g, b] = radiance((x + 0.5) / W, (y + 0.5) / H)
    const [R, G, B, E] = toRGBE(r, g, b)
    const o = (y * W + x) * 4
    planes[o] = R
    planes[o + 1] = G
    planes[o + 2] = B
    planes[o + 3] = E
  }
}

// New-format RLE encode.
function emitLiterals(scan, from, to, out) {
  let i = from
  while (i < to) {
    const n = Math.min(128, to - i)
    out.push(n)
    for (let k = 0; k < n; k++) out.push(scan[i + k])
    i += n
  }
}
function encodeChannel(scan, out) {
  let x = 0
  while (x < W) {
    let runStart = x
    while (runStart < W) {
      let run = 1
      while (runStart + run < W && scan[runStart + run] === scan[runStart] && run < 127) run++
      if (run >= 4) {
        if (runStart > x) emitLiterals(scan, x, runStart, out)
        out.push(128 + run, scan[runStart])
        x = runStart + run
        runStart = x
      } else {
        runStart += run
        if (runStart - x >= 128) {
          emitLiterals(scan, x, x + 128, out)
          x += 128
          runStart = x
        }
      }
    }
    if (x < W) {
      emitLiterals(scan, x, W, out)
      x = W
    }
  }
}

const bytes = [...Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, 'ascii')]
const chan = new Uint8Array(W)
for (let y = 0; y < H; y++) {
  bytes.push(2, 2, (W >> 8) & 0xff, W & 0xff)
  for (let c = 0; c < 4; c++) {
    for (let x = 0; x < W; x++) chan[x] = planes[(y * W + x) * 4 + c]
    encodeChannel(chan, bytes)
  }
}
const buf = Buffer.from(bytes)

const target = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'env',
  'studio-soft.hdr',
)
mkdirSync(dirname(target), { recursive: true })
// See the retirement note at the top: the shipped map is a real studio
// photograph now, and regenerating over it flattens every garment.
if (existsSync(target) && !process.argv.includes('--force')) {
  console.error(
    `gen-env-hdr: REFUSING to overwrite ${target}.\n` +
      'That file is Poly Haven studio_small_09 (CC0), downsampled to 256x128 — not this\n' +
      "script's output. Regenerating it would light every garment flat again, which is\n" +
      'measurably 21x further from the reference than what ships. Pass --force if you\n' +
      'genuinely mean to go back to the analytic placeholder.',
  )
  process.exit(1)
}
writeFileSync(target, buf)

// Verify: decode what we wrote and confirm it round-trips exactly.
function decode(b) {
  const text = b.toString('ascii', 0, 2000)
  const res = text.match(/-Y (\d+) \+X (\d+)\n/)
  if (!text.startsWith('#?RADIANCE') || !res) throw new Error('bad header')
  const h = +res[1]
  const w = +res[2]
  let p = text.indexOf(res[0]) + res[0].length
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    if (b[p] !== 2 || b[p + 1] !== 2 || ((b[p + 2] << 8) | b[p + 3]) !== w)
      throw new Error(`scanline ${y}`)
    p += 4
    for (let c = 0; c < 4; c++) {
      let x = 0
      while (x < w) {
        const count = b[p++]
        if (count > 128) {
          const v = b[p++]
          for (let k = 0; k < count - 128; k++) out[(y * w + x++) * 4 + c] = v
        } else {
          for (let k = 0; k < count; k++) out[(y * w + x++) * 4 + c] = b[p++]
        }
      }
    }
  }
  return { out, consumed: p }
}
const dec = decode(buf)
let mismatches = 0
for (let i = 0; i < planes.length; i++) if (dec.out[i] !== planes[i]) mismatches++
if (mismatches !== 0 || dec.consumed !== buf.length) {
  console.error(
    `gen-env-hdr: VERIFY FAILED (mismatches ${mismatches}, consumed ${dec.consumed}/${buf.length})`,
  )
  process.exit(1)
}
console.log(
  `gen-env-hdr: wrote ${target} (${(buf.length / 1024).toFixed(1)} KB, ${W}x${H}) — round-trip OK`,
)
