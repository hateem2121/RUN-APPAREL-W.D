import type { GlbReport } from '../../../tools/asset-pipeline/src/validate'
import { SIZE_WARNING_BYTES } from '../../../tools/asset-pipeline/src/validate'
import type { OptimizeResult } from '../../../tools/asset-pipeline/src/optimize'

/**
 * The words the owner actually reads, and the only pure part of the container.
 *
 * EXTRACTED FROM server.ts so it can be tested. `server.ts` calls
 * `server.listen()` at import time and pulls in node:http and aws4fetch, so no
 * test could import it without starting a real HTTP server — which is why ~10 KB
 * of code that processes every single production garment had zero tests and only
 * a CI typecheck. Everything here is a pure function of the pipeline's own
 * result objects, so it costs nothing to cover.
 *
 * The audience is one non-technical person deciding whether to publish a
 * garment. Every line has to say what happened and what to do about it, without
 * a term they would have to look up.
 */

/** A URL-safe Media filename derived from the raw key, always ending in .glb. */
export function suggestedFilename(key: string): string {
  const base = key.split('/').pop() ?? 'garment.glb'
  const stem = base.replace(/\.glb$/i, '')
  const safe = stem
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${safe || 'garment'}-optimized.glb`
}

/** Build an R2/S3 object URL, encoding each path segment but keeping slashes. */
export function objectUrl(endpoint: string, bucket: string, key: string): string {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return `${endpoint.replace(/\/$/, '')}/${bucket}/${path}`
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

export function buildReportText(opt: OptimizeResult, glb: GlbReport, filename: string): string {
  // The mobile guideline, stated plainly. Nothing in CI can check this — the
  // Lighthouse budget runs against a 10 KB placeholder, so a real 20 MB garment
  // is invisible to it — and the hard 40 MB ceiling only catches the extreme
  // case. This line is the only place the owner is told a published file is
  // heavy for a QR scan on mobile data.
  const overMobileBudget = opt.bytesAfter > SIZE_WARNING_BYTES
  const guidelineMb = SIZE_WARNING_BYTES / 1024 / 1024

  // File order, not alphabetical: the CMS lists these back to the owner so they
  // can say which of their colours is which. Nothing is renamed, so it no longer
  // matters what CLO called them.
  const found = glb.variantsInFileOrder.length ? glb.variantsInFileOrder : glb.variants

  return [
    `Shrunk ${mb(opt.bytesBefore)} MB → ${mb(opt.bytesAfter)} MB.`,
    overMobileBudget
      ? `⚠️ Still over the ${guidelineMb} MB mobile guideline. It will publish and work, but ` +
        'it is a slow load over phone data, which is how most people reach this page. ' +
        'Most of a CLO export is geometry, so the lever is a lower Detail setting or a lighter mesh from CLO.'
      : `Within the ${guidelineMb} MB mobile guideline.`,
    `Suggested filename: ${filename}`,
    // Each CLO variant name with the colour it ACTUALLY is. Before this the list
    // was bare strings like "Colorway 2", so mapping them to the CMS was a guess
    // — and on 2026-08-03 production was serving a maroon garment labelled Navy,
    // a blush one labelled Black and a powder blue one labelled Crimson, with
    // two colourways in the file that were never mapped at all.
    found.length
      ? `Colours found inside your file, in order:\n${found
          .map((name, i) => {
            const colour = glb.variantColours.find((c) => c.variantId === name)
            if (!colour) return `  ${i + 1}. ${name}`
            const guess =
              colour.confidence === 'high'
                ? `looks like ${colour.name}`
                : `closest match ${colour.name}, but not a confident one — check the swatch`
            return `  ${i + 1}. ${name} — ${guess} (${colour.hex})`
          })
          .join('\n')}`
      : 'No colours are stored inside this file. That is fine for a single-colour garment — set the product to “A separate file for each colour”.',
    `See-through (BLEND) materials: ${glb.translucentMaterialCount}`,
    // How each translucent material was resolved. "Kept see-through" is the one
    // to read: those are materials whose alpha is a genuine gradient, so the
    // pipeline declined to flatten them. If the garment is not actually sheer,
    // that is a CLO export to fix rather than a setting to change.
    opt.solidify
      ? `Transparency: ${opt.solidify.opaqued} made solid, ${opt.solidify.masked} kept as cut-out shapes, ` +
        `${opt.solidify.keptBlend} kept see-through.`
      : 'Transparency: left untouched for this job.',
    opt.textures
      ? `Textures: ${opt.textures.artwork} treated as printed artwork (encoded at high fidelity), ` +
        `${opt.textures.standard} as fabric.` +
        (opt.textures.artworkNames.length
          ? ` Artwork: ${opt.textures.artworkNames.join(', ')}.`
          : '') +
        // Resizing artwork is a legitimate trade AND real stroke detail gone from
        // a wordmark. The owner should watch it happen rather than discover it by
        // squinting at the finished garment.
        (opt.textures.artworkResized?.length
          ? ` ⚠️ These graphics had to be shrunk to fit, so fine lettering on them is softer: ${opt.textures.artworkResized.join(', ')}.`
          : '')
      : 'Textures: not re-encoded for this job.',
    // What the decimation pass actually did. `fallback` primitives were decimated
    // position-only with borders locked, i.e. the UV weight that is supposed to
    // protect printed artwork did nothing for them — which is invisible from file
    // size alone and was costing whole sessions of tuning a knob that was not
    // connected.
    opt.simplify
      ? `Mesh decimation: ${opt.simplify.attributeAware} part(s) with artwork protection, ` +
        `${opt.simplify.fallback} without, ${opt.simplify.skipped} untouched.` +
        (opt.simplify.fallback > opt.simplify.attributeAware
          ? ' ⚠️ Most parts were decimated WITHOUT artwork protection — printed graphics on those are at risk.'
          : '')
      : 'Mesh decimation: not run for this job.',
    // The named version of the line above, and the one that matters. A high
    // `fallback` count on plain fabric is harmless; a SINGLE logo material in
    // this list is the mechanism that tore N001's wordmark apart. Naming the
    // materials means the owner can find them in CLO instead of being told a
    // number they cannot act on.
    opt.simplify?.artworkAtRisk.length
      ? `\n🛑 PRINTED ARTWORK WAS NOT PROTECTED on: ${opt.simplify.artworkAtRisk.join(', ')}.\n` +
        'Those parts carry printed graphics and were shrunk without guarding the artwork, so logos ' +
        'and lettering on them are likely torn or blurred. This file has NOT been saved. ' +
        'Re-upload with the Detail setting on “Highest quality”, and if it happens again the artwork ' +
        'needs its own UV map in CLO.'
      : '',
    glb.warnings.length ? `Warnings:\n- ${glb.warnings.join('\n- ')}` : 'No warnings.',
    '',
    found.length
      ? 'Next: open the product’s Colours tab and answer “Which colour in your CLO file is this?” for each colour, then Publish. The names above are whatever CLO called them — they do not have to look like anything in particular.'
      : 'Next: open the product, attach this file to the colour it belongs to, then Publish.',
  ].join('\n')
}
