import { describeSpecIssues } from '../../../tools/asset-pipeline/src/gltf-spec'
import type { GlbReport } from '../../../tools/asset-pipeline/src/validate'
import { SIZE_WARNING_BYTES, describeSoftArtwork } from '../../../tools/asset-pipeline/src/validate'
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

export function buildReportText(
  opt: OptimizeResult,
  glb: GlbReport,
  filename: string,
  /**
   * What the finished file is made of, from `attributeBytes`.
   *
   * ⚠️ OPTIONAL BECAUSE IT ARRIVED LATE, NOT BECAUSE IT IS DECORATIVE. Added 2026-08-29
   * after an independent check found the composition report had been wired into the CLI
   * only — a command nothing in CI runs and no customer garment passes through. The
   * instrument was well tested and reached nobody, which is precisely the "built, tested,
   * never connected" shape the whole remediation exists to close. It is optional so an
   * older caller still compiles; every production caller passes it.
   */
  composition?: string[],
  /**
   * The depth-bias records the container wrote for printed layers stacked on cloth
   * (fix plan Rank 7C, 2026-09-03). Optional so an older caller still compiles.
   */
  overlays?:
    | {
        measured: number
        overlayReadings: number
        flagged: number
        review: number
        clones: number
        threadIgnored: number
        written: boolean
      }
    | { error: string },
  /**
   * Does the ink come out the colour of the cloth it sits on? (fix plan Rank 9). A flag
   * is a question for the owner, never a change to the file.
   */
  ink?:
    | { prints: number; colourways: number; rows: number; flagged: number; lines: string[] }
    | { error: string },
  /** The family the flags were chosen for, with the GPU share beside it (fix plan Rank 10, F2-10). */
  familyReason?: string,
): string {
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
    // Phone graphics memory beside the file size (fix plan Rank 10, audit TEX-04): a
    // 3.4 MB file can need 83 MB of a phone's GPU, and iOS drops the 3D view past ~256 MB.
    // The file size never said this; the owner published five garments over the line.
    opt.gpu
      ? `Phone graphics memory: about ${(opt.gpu.totalBytes / 1048576).toFixed(0)} MB of texture memory ` +
        `(artwork ${(opt.gpu.artworkBytes / 1048576).toFixed(0)}, fabric ${(opt.gpu.fabricBytes / 1048576).toFixed(0)}, shading maps ${(opt.gpu.shadingBytes / 1048576).toFixed(0)})` +
        (opt.gpu.overBudget
          ? ' ⚠️ OVER THE 256 MB PHONE BUDGET — iPhones can drop the 3D view on this file. Fewer or smaller pictures in CLO, or a lower Detail setting.'
          : ' — within the phone budget.')
      : 'Phone graphics memory: not estimated for this job.',
    familyReason ? `Budget family: ${familyReason}.` : '',
    opt.fold?.folded.length
      ? `Folded ${opt.fold.folded.length} constant shading map(s) into material values (${opt.fold.folded.map((f) => `${f.name} ${f.width}x${f.height}`).join(', ')}): the same look, ${(opt.fold.folded.reduce((s, f) => s + f.gpuBytes, 0) / 1048576).toFixed(0)} MB less phone memory.`
      : '',
    // UV storage (fix plan Rank 11, audit CT-08): CLO's pattern-space UVs were the largest
    // thing in every file and the only attribute left as 32-bit floats, because the
    // quantizer refuses anything outside 0..1. Saying it moved is how a report proves it.
    opt.uvRemap
      ? opt.uvRemap.primitives
        ? `UV storage: ${opt.uvRemap.accessors} UV set(s) on ${opt.uvRemap.primitives} piece(s) moved into 0..1 and stored as 16-bit integers (${opt.uvRemap.groups} group(s), widest range ${opt.uvRemap.widestRange.toFixed(0)} pattern units).` +
          (opt.uvRemap.skipped.length
            ? ` ⚠️ Left as floats: ${opt.uvRemap.skipped.join('; ')}.`
            : '')
        : 'UV storage: every UV set was already inside 0..1; stored as 16-bit integers.'
      : '',
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
                ? `looks like ${colour.name}${colour.sampledFrom === 'texture' ? ' (read from the fabric picture)' : ''}`
                : `closest match ${colour.name}, but not a confident one — check the swatch`
            // Since 2026-09-02 the file can be the reason a name is blank (audit CG-06):
            // every colourway behind one shared picture. Say so, or the owner types five
            // names that the next export blanks again.
            const why = colour.note ? ` — ${colour.note}` : ''
            return `  ${i + 1}. ${name} — ${guess} (${colour.hex})${why}`
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
        `${opt.simplify.fallback} without, ${opt.simplify.skipped} untouched` +
        // Since 2026-09-02 a print piece is never decimated (fix plan Rank 3). Named,
        // so the owner sees what was protected — and so an old-style export whose
        // whole panel IS the print shows up as a big number rather than a mystery.
        ((opt.simplify.artworkUntouched ?? 0) > 0
          ? `, ${opt.simplify.artworkUntouched} print piece(s) left exactly as exported (${(opt.simplify.artworkUntouchedMaterials ?? []).join(', ')}).`
          : '.') +
        (opt.simplify.fallback > opt.simplify.attributeAware
          ? ' ⚠️ Most parts were decimated WITHOUT artwork protection — printed graphics on those are at risk.'
          : '')
      : 'Mesh decimation: not run for this job.',
    // The anti-flicker records. A printed OPAQUE layer sits 0.100 mm on the cloth in a
    // CLO export and the two fight for the depth test as the garment turns; the viewer
    // nudges any layer the pipeline flagged. Until 2026-09-03 no robot run ever wrote
    // one (audit F2-06, MAT-04, MAT-05, HG-05), so this line is the proof it did.
    ink === undefined
      ? ''
      : 'error' in ink
        ? `⚠️ Ink vs cloth: not measured (${ink.error}).`
        : ink.flagged === 0
          ? `Ink vs cloth: ${ink.prints} print(s) checked on ${ink.colourways} colourway(s) — every print stands out from the cloth beneath it.`
          : `⚠️ Ink vs cloth: ${ink.flagged} of ${ink.rows} print-colourway pairs read as bare cloth or carry the cloth's own colour value. ` +
            "CLO writes the colourway colour into a print; set the graphic's colour in CLO for those colourways and re-export, or tell us it is intended:\n" +
            ink.lines.map((line) => `  - ${line}`).join('\n'),
    overlays === undefined
      ? 'Anti-flicker: overlay scan not run for this job.'
      : 'error' in overlays
        ? `⚠️ Anti-flicker: the overlay scan failed (${overlays.error}) — the file was saved without depth-bias records; the viewer still nudges cut-outs on its own.`
        : `Anti-flicker: ${overlays.measured} part(s) measured, ${overlays.overlayReadings} read as a printed layer on cloth, ` +
          `${overlays.flagged} material(s) recorded for the viewer's depth nudge` +
          `${overlays.review ? `, ${overlays.review} held for review` : ''}` +
          `${overlays.clones ? `, ${overlays.clones} material(s) cloned so the cloth beneath is not nudged` : ''}` +
          `${overlays.threadIgnored ? `, ${overlays.threadIgnored} on thread or hardware ignored` : ''}` +
          `${overlays.flagged && !overlays.written ? ' — ⚠️ NOT WRITTEN: the binary chunk moved' : ''}.`,
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
    // Prints the pipeline chose to leave translucent. Loud, because a soft logo on a
    // BLEND material is what the owner will see in the viewer — but NOT a refusal,
    // because it is the pipeline's own decision (soft-edged alpha, or an opacity the
    // designer set in CLO). Until 2026-09-02 this case refused the whole garment, and
    // two of the owner's five finished files could not be published (audit F2-01,
    // B-01). `artworkSoftOnBlend` is absent from a report built before that date.
    glb.artworkSoftOnBlend?.length
      ? `\n⚠️ SOFT PRINTED ARTWORK KEPT SEE-THROUGH on: ${glb.artworkSoftOnBlend.map(describeSoftArtwork).join('; ')}.\n` +
        'These prints have soft edges or were made translucent in CLO, so the pipeline left them blended ' +
        'instead of cutting them out. The file HAS been saved. Look at them in the viewer; if a print ' +
        'should be solid, set its opacity to 100% in CLO and re-export.'
      : '',
    // The official Khronos verdict on what this pipeline just wrote.
    //
    // ⚠️ THIS LINE DID NOT EXIST UNTIL 2026-08-29, and `glb.spec` was read by nothing
    // at all — the container computed the verdict on every garment and dropped it. The
    // measured cost: both live garments are invalid glTF (44 errors on the cycling
    // suit) from a WebP pass that omitted the EXT_texture_webp declaration, and no
    // report ever said so because no report looked.
    //
    // Errors also REFUSE the job in the Worker (gate 2d). This line exists so the
    // owner is told what happened in words, rather than only seeing a job fail.
    // What the file is MADE OF. Every other size figure in this report is a total, and a
    // total hid the largest cheap win in the catalogue for weeks: texture coordinates are
    // the biggest thing in a garment and the only attribute left uncompressed.
    ...(composition ?? []),
    glb.spec.counts.errors > 0
      ? `\n🛑 NOT A VALID 3D FILE — ${glb.spec.counts.errors} error(s) from the official glTF ` +
        `validator (${glb.spec.validatorVersion}). This file has NOT been saved. A web browser ` +
        `would probably still show it, but other 3D software is entitled to refuse it.\n` +
        describeSpecIssues(glb.spec.errors, 5)
          .map((i) => `  • ${i}`)
          .join('\n')
      : `Valid 3D file: checked against the official glTF specification (${glb.spec.validatorVersion})` +
        (glb.spec.counts.warnings > 0
          ? `, with ${glb.spec.counts.warnings} non-blocking warning(s).`
          : ', no problems found.'),
    glb.warnings.length ? `Warnings:\n- ${glb.warnings.join('\n- ')}` : 'No warnings.',
    '',
    found.length
      ? 'Next: open the product’s Colours tab and answer “Which colour in your CLO file is this?” for each colour, then Publish. The names above are whatever CLO called them — they do not have to look like anything in particular.'
      : 'Next: open the product, attach this file to the colour it belongs to, then Publish.',
  ].join('\n')
}
