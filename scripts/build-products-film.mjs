#!/usr/bin/env node
/**
 * Builds the /products hero film (the owner's request of 2026-10-01: the hoodie film plays behind
 * the hero's headline, under the same dark wash as the home page's photo) from the owner's original.
 *
 * ⚠️ THE ORIGINAL NEVER ENTERS THE REPOSITORY. It is a 4.72 MB, 7.7 Mbit/s H.264 file with a sound
 * track and its index at the END (so a browser had to fetch the end before it could start); only
 * the web files this writes are committed, under `apps/cms/public/film/`.
 *
 * What it does, measured on 2026-10-02 (ffmpeg 9.0.2 from Homebrew; sharp from the pipeline's
 * dependencies, as `scripts/build-factory-photos.mjs` uses it):
 *
 *  1. A LOOP THAT DOES NOT JUMP. The original's last frame and first frame differ by 45.7 (mean
 *     absolute difference per channel, 0–255): the hoodie snapped from the pocket back to the chest
 *     logo every 4.9 s. Frames 10–117 now play, and their last 10 cross-fade into frames 0–9, so the
 *     film ends where it starts. The seam measures 10.4, under the 12–17 of two ordinary neighbouring
 *     frames. 108 frames at 24 fps: 4.5 s.
 *  2. TWO VIDEO FILES, no sound, "fast start" (the index first, so playback begins at once): AV1
 *     (SVT-AV1 preset 4, CRF 38) for browsers that decode it, about 310 KB; H.264 (x264 veryslow,
 *     CRF 26, High profile at level 4.0, which older iPhones decode) for the rest, about 900 KB —
 *     the owner chose that sharper of three on 2026-10-02 (CRF 28: 710 KB; CRF 29: 632 KB).
 *  3. THE STILL: the loop's first frame, shown before any video loads, with scripting off, under
 *     reduced motion and on Data Saver. 540 and 720 px wide, AVIF quality 45 and WebP quality 72,
 *     the home hero photo's settings (about 15–36 KB).
 *
 * Usage:
 *   node scripts/build-products-film.mjs "<path to Purple_white_tie-dye_hoodie.mp4>"
 * The page's list of these files: apps/cms/src/lib/productsFilm.ts. Its unit test fails if one is
 * missing or the wrong size.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const source = process.argv[2]
if (!source) {
  console.error('Usage: node scripts/build-products-film.mjs "<path to the original film>"')
  process.exit(1)
}
const out = resolve(import.meta.dirname, '../apps/cms/public/film')
mkdirSync(out, { recursive: true })
const work = mkdtempSync(join(tmpdir(), 'products-film-'))
const ffmpeg = (args) =>
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])

// 1. The loop, kept lossless (FFV1) so both encodes start from the same frames.
const FADE_FRAMES = 10
const LAST_FRAME = 118
const FPS = 24
const body = LAST_FRAME - FADE_FRAMES
const loop = [
  '[0:v]split=2[a][b]',
  `[a]trim=start_frame=${FADE_FRAMES}:end_frame=${LAST_FRAME},setpts=PTS-STARTPTS[body]`,
  `[b]trim=start_frame=0:end_frame=${FADE_FRAMES},setpts=PTS-STARTPTS[head]`,
  `[body][head]xfade=transition=fade:duration=${FADE_FRAMES / FPS}:offset=${(body - FADE_FRAMES) / FPS},format=yuv420p[v]`,
].join(';')
const master = join(work, 'master.mkv')
ffmpeg(['-i', source, '-filter_complex', loop, '-map', '[v]', '-an', '-c:v', 'ffv1', master])

// 2. The two web files.
const av1 = join(out, 'tie-dye-hoodie-av1.mp4')
ffmpeg([
  ...['-i', master, '-an', '-c:v', 'libsvtav1', '-preset', '4', '-crf', '38'],
  ...['-pix_fmt', 'yuv420p', '-movflags', '+faststart', av1],
])
const h264 = join(out, 'tie-dye-hoodie-h264.mp4')
ffmpeg([
  ...['-i', master, '-an', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '26'],
  ...[
    '-profile:v',
    'high',
    '-level:v',
    '4.0',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    h264,
  ],
])

// 3. The still, from the loop's own first frame.
const frame = join(work, 'first.png')
ffmpeg(['-i', master, '-vf', 'select=eq(n\\,0)', '-frames:v', '1', frame])
// sharp is the pipeline's dependency, not this script's (scripts/build-factory-photos.mjs does the same).
const sharp = createRequire(resolve(import.meta.dirname, '../tools/asset-pipeline/package.json'))(
  'sharp',
)
for (const width of [540, 720]) {
  const resized = () => sharp(frame).resize({ width })
  await resized()
    .avif({ quality: 45, effort: 6 })
    .toFile(join(out, `tie-dye-hoodie-${width}.avif`))
  await resized()
    .webp({ quality: 72, effort: 6, smartSubsample: true })
    .toFile(join(out, `tie-dye-hoodie-${width}.webp`))
}
rmSync(work, { recursive: true, force: true })

for (const name of [
  'tie-dye-hoodie-av1.mp4',
  'tie-dye-hoodie-h264.mp4',
  'tie-dye-hoodie-540.avif',
  'tie-dye-hoodie-540.webp',
  'tie-dye-hoodie-720.avif',
  'tie-dye-hoodie-720.webp',
]) {
  console.log(`${name}  ${statSync(join(out, name)).size} bytes`)
}
