import type { Document, Material, Texture, Transform } from '@gltf-transform/core'
import { alphaBoostForCoverage, applyAlphaBoost } from './alpha-coverage'
import { findArtworkTexturesByGeometry, isThreadOrHardwareName } from './artwork-geometry'
import { EXTTextureWebP } from '@gltf-transform/extensions'
import { createTransform, listTextureSlots } from '@gltf-transform/functions'
import sharp, { type OutputInfo } from 'sharp'
import {
  type AlphaProfile,
  ARTWORK_ASPECT_RATIO,
  CRUSHED_BYTES_PER_PIXEL,
  isFlatInk,
  profileInkDetail,
  NO_ALPHA_PROFILE,
  OPAQUE_FACTOR_THRESHOLD,
  profileAlpha,
  resolveBlendAlpha,
} from './textures'

/**
 * Texture re-encoding that treats printed artwork differently from fabric.
 *
 * WHY THIS REPLACED `textureCompress`. The pipeline used to push every texture
 * through glTF-Transform's `textureCompress` at quality 82 with no slot filter.
 * libwebp's lossy encoder works exclusively in 8-bit Y'CbCr **4:2:0** — chroma
 * stored at half resolution in both axes — so hard saturated edges bleed into
 * their neighbours. That is the canonical failure mode for a wordmark or a flat
 * printed graphic, and it matches the measured evidence: a 2048x2048 base-colour
 * map stored in 13 KB is 0.003 bytes/pixel, which is what q82 4:2:0 does to a
 * mostly-flat logo on transparency.
 *
 * WHY NOT JUST PASS OPTIONS TO `textureCompress`. Its `TextureCompressOptions`
 * exposes `quality`, `lossless`, `nearLossless` and `chromaSubsampling` — but
 * `chromaSubsampling` is a JPEG/AVIF option and sharp ignores it for WebP. The
 * levers that actually address this are `smartSubsample` (libwebp's "Sharp YUV",
 * which computes chroma in linear light instead of naively averaging),
 * `alphaQuality` and `effort`, and `textureCompress` exposes none of them.
 * Reaching them needs to call sharp directly, which this package already does
 * elsewhere.
 *
 * `smartSubsample` is applied to EVERY texture, artwork or not. It costs no file
 * size — it changes how chroma is computed, not how much is stored — and it
 * exists precisely for this artefact. There is no reason to have it off.
 *
 * The artwork/standard split then buys the rest: quality and alpha fidelity go
 * up, and the resize cap comes off, only for the textures that carry graphics.
 * Textures were 2.1 MB of a 19 MB file, so this is close to free — the geometry
 * is what makes these files big.
 */

/** Names CLO and its users give artwork textures. Matched case-insensitively against name and URI. */
const ARTWORK_NAME = /(logo|print|graphic|artwork|label|decal|badge|emblem|wordmark|text|type)/i

/**
 * Artwork words safe to match against a MATERIAL name. See
 * `isArtworkMaterialByName` for why this is not `ARTWORK_NAME`.
 *
 * `slogan`, `extra mile`, `never look back` and the Japanese ろご / ロゴ ("logo")
 * were added 2026-09-02 (audit MAT-17, CLO-04): CLO names the owner's slogan material
 * `THE EXTRA MILE (Slogan)` on 33 materials across seven garments, `Extra Mile` and
 * `Never Look Back` on others, and `ルン ろご。` ("run logo") on the women's dress —
 * none matched, so none was protected from decimation. The audit's two-way control
 * holds: none of the seven fabric names it tested (`Textile_Cotton`, `Texture_Map_01`,
 * `Polyester_Textured`, `Cotton_Canvas`, `Default Fabric`, `SUPPLIER_DOBBY_A`,
 * `Default Topstitch`) contains any of these words. Pinned in texture-artwork.test.ts.
 */
const ARTWORK_MATERIAL_NAME =
  /(^|[^a-z])(logo|print|graphic|artwork|label|decal|badge|emblem|wordmark|slogan|extra mile|never look back|ろご|ロゴ)([^a-z]|$)/i

/** Slots that are data, not pictures. Never treated as artwork whatever they are called. */
const DATA_SLOT = /(normal|metallicRoughness|occlusion)Texture/i

/** Encoder settings. Defaults live in optimize.ts so the CLI and this stay in step. */
export interface ArtworkTextureOptions {
  /** WebP quality for ordinary fabric maps. */
  quality: number
  /** Resize cap for ordinary fabric maps, aspect preserved, never enlarged. */
  maxSize: number
  /** WebP quality for textures carrying printed graphics. */
  artworkQuality: number
  /** Resize cap for artwork. Higher, because thin lettering is what resampling destroys first. */
  artworkMaxSize: number
  /**
   * Resize cap for textures used ONLY in data slots (normal / metallicRoughness /
   * occlusion). Optional; falls back to `maxSize`, so leaving it unset keeps the
   * old behaviour exactly.
   *
   * Worth setting to half `maxSize`. Measured 2026-08-21 on the Cycling-Bib
   * export: these maps were 9.63 MB of a 16.65 MB texture budget — MORE than the
   * artwork (7.03 MB) — because they were running at colour-map resolution. They
   * carry shading, not pictures, and the eye cannot resolve them there. Halving
   * them took the finished model 38.1 MB → 32.6 MB with no visible change.
   * Quartering them was also tried and REFUSED: 1.67% of pixels moved by >8/255
   * and it visibly flattened the white fabric's weave, for one more megabyte.
   */
  dataMaxSize?: number
  onResult?: (result: TextureArtworkResult) => void
}

export interface TextureArtworkResult {
  /** Textures encoded with the artwork settings. */
  artwork: number
  /** Textures encoded with the standard settings. */
  standard: number
  /** Textures left alone — no image, or a format sharp cannot read (e.g. KTX2). */
  skipped: number
  /** Names/URIs classified as artwork, so the choice is auditable rather than magic. */
  artworkNames: string[]
  /** Artwork whose alpha was rescaled to keep its ink through alphaCutoff 0.5. */
  alphaBoosted: string[]
  /**
   * Artwork textures that had to be resampled smaller to fit the cap. Reported,
   * not blocked: it is a real loss of stroke detail on a wordmark, and also a
   * legitimate trade the owner should get to see rather than discover.
   */
  artworkResized: string[]
}

/** Formats sharp can decode here. KTX2 and other GPU formats are left untouched. */
const DECODABLE = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Decide whether a texture carries printed artwork.
 *
 * Three independent signals, any of which is enough. They are deliberately
 * generous: mis-classifying fabric as artwork costs a few hundred KB, while
 * mis-classifying artwork as fabric is the bug this module exists to fix.
 */
// A normal or ORM map is data. Encoding it at quality 95 wastes bytes and
// protects nothing, and its name may well contain "print" by coincidence.
function isDataTexture(texture: Texture): boolean {
  const slots = listTextureSlots(texture)
  return slots.length > 0 && slots.every((slot) => DATA_SLOT.test(slot))
}

/**
 * Does this MATERIAL's own name say it carries printed artwork?
 *
 * Needed because a CLO export names the MATERIAL and leaves every texture
 * anonymous. Measured 2026-08-21 on the Cycling-Bib export: **0 of 24 textures had
 * a name or URI**, while the materials were called things like
 * "White Black Bold Minimalist Clothing Label_9946645". Any name-based check that
 * only reads the texture is therefore silently inert on real CLO files — which is
 * exactly how a first attempt at the double-siding fix below did nothing at all.
 *
 * Deliberately NOT wired into `isArtworkTexture` (the compression budget, which
 * has the UV-span signal for that). It IS one of the strict gate's signals since
 * 2026-09-02 — see `classifyArtworkForGate`, where a name is what separates a
 * decal from thread.
 *
 * ⚠️ USES ITS OWN, TIGHTER PATTERN — do not "simplify" this back to `ARTWORK_NAME`.
 * That regex is unanchored and includes `text` and `type`, which is fine for
 * TEXTURE names but dangerous for MATERIAL names, where CLO writes things like
 * `Textile_Cotton`, `Texture_Map_01` or `Polyester_Textured`. All three contain
 * "text" and would be classified as artwork, exempting real FABRIC from
 * double-siding — i.e. silently reinstating the see-through-garment bug this
 * pipeline exists to fix. Caught by auditing the regex against plausible names,
 * not by any failing test.
 *
 * So: the two ambiguous tokens are dropped, and the rest must sit on a token
 * boundary. `\b` is not usable here — `_` is a word character, so `\bgraphic`
 * would not match `Material_Graphic`, which is the single most important real
 * name this has to catch.
 */
export function isArtworkMaterialByName(material: { getName(): string }): boolean {
  return ARTWORK_MATERIAL_NAME.test(material.getName() || '')
}

/**
 * The SYNCHRONOUS half of `isArtworkTexture` — name and URI only, no decode.
 *
 * Split out for the decimation pass, which walks every primitive synchronously.
 * A real CLO export here has 200 materials; awaiting a sharp metadata read per
 * texture inside that loop is not worth it when the name signal alone already
 * catches what this file's own export contains (`RUN LOGO_3183`,
 * `Teamwear Logo_3139`).
 *
 * Weaker than the async version on purpose: it misses an unnamed wordmark that
 * only the aspect-ratio or binary-alpha signal would find. Callers that can
 * afford to await should use `isArtworkTexture`.
 */
export function isArtworkTextureByName(texture: Texture): boolean {
  if (isDataTexture(texture)) return false
  return ARTWORK_NAME.test(`${texture.getName()} ${texture.getURI()}`)
}

export interface CrushedArtwork {
  index: number
  name: string
  width: number
  height: number
  bytes: number
  /** Over the whole picture — kept for the record; the verdict uses the ink figure. */
  bytesPerPixel: number
  /** The share of pixels that carry ink (part-transparent or opaque); 1 without an alpha channel. */
  inkFraction: number
  /** Bytes per INK pixel — the number judged against CRUSHED_BYTES_PER_PIXEL since 2026-09-02. */
  bytesPerInkPixel: number
}

/**
 * Artwork textures stored below `CRUSHED_BYTES_PER_PIXEL`.
 *
 * WHY THIS EXISTS AS A SEPARATE FUNCTION. The threshold and a check using it
 * have been in `textures.ts` since the artwork investigation, but only inside
 * `inventoryTextures`, which runs from the manual `textures` command. The
 * automated path — the one that processes every real garment — calls
 * `inspectGlb`, which never looked at it. So the single cheapest measurement of
 * the reported damage existed, was correct, and was not connected to anything:
 * N001's live file has a 2048x2048 colour map at 0.003 bpp, 6.6x past the line.
 *
 * Narrower than the `inventoryTextures` version, which flags any baseColor or
 * emissive map. Fabric is allowed to encode cheaply; a wordmark is not. Scoping
 * it to artwork is what keeps this usable as a signal instead of noise.
 *
 * Still only a WARNING. A genuinely flat artwork texture — a solid-colour label —
 * also encodes tiny, and a gate the owner learns to override is worse than no
 * gate. The blocking signal is `artworkAtRisk` in simplify-textured.ts, which is
 * structural and cannot false-positive.
 *
 * MEASURED OVER THE INK SINCE 2026-09-02 (audit F2-07). Bytes per pixel of the WHOLE
 * picture cried wolf on three of four finished garments: a logo strip is mostly
 * transparent padding with a hard edge, which WebP stores in almost nothing, so a
 * healthy encode of AERO's 1095x720 strip came out at 0.0121 and 4096x1263 at 0.0181
 * while the 6° crops matched the raw file to 0.6% of pixels. Divided by the ink
 * fraction those are 0.024 and 0.074; the wordmark that really WAS crushed (N001's
 * live file, 0.003 over the picture) is 0.009. The 0.02 line separates them both ways.
 */
export async function findCrushedArtwork(document: Document): Promise<CrushedArtwork[]> {
  const crushed: CrushedArtwork[] = []
  // WHICH TEXTURES ARE PRINTS. `isArtworkTexture` reads the TEXTURE's name, aspect
  // and alpha — and a CLO export leaves every texture anonymous, so an opaque
  // 1800x1200 care label (alpha none, aspect 1.5) was invisible to it: the crushed
  // q15 control of 2026-09-02 passed this check in silence. The material name and
  // the UV span are the signals that actually name a print in this catalogue
  // (classifyArtworkForGate, findArtworkTexturesByGeometry); a texture any of the
  // three calls artwork is judged.
  const named = new Set<Texture>(findArtworkTexturesByGeometry(document))
  const cache = new Map<Texture, AlphaProfile>()
  for (const material of document.getRoot().listMaterials()) {
    if (!(await classifyArtworkForGate(material, cache)).artwork) continue
    for (const texture of [material.getBaseColorTexture(), material.getEmissiveTexture()]) {
      if (texture) named.add(texture)
    }
  }
  for (const [index, texture] of document.getRoot().listTextures().entries()) {
    const image = texture.getImage()
    if (!image) continue
    let width: number | undefined
    let height: number | undefined
    try {
      // Header only — sharp does not decode pixels for `metadata()`.
      ;({ width, height } = await sharp(image).metadata())
    } catch {
      continue // KTX2 and other GPU formats: not measurable this way, not our call.
    }
    if (!width || !height) continue
    const bytesPerPixel = image.byteLength / (width * height)
    // CHEAP TEST FIRST. Bytes per pixel of the whole picture is a header-only
    // number and an UPPER bound on the ink figure (ink is at most every pixel), so a
    // picture that clears the line here clears it over the ink too — the decode runs
    // only for the few that do not. Measured on output/n001.glb: 0.21 ms/call for the
    // whole function, against 0.90 ms for `inspectGlb` end to end.
    if (bytesPerPixel >= CRUSHED_BYTES_PER_PIXEL) continue
    if (!named.has(texture) && !(await isArtworkTexture(texture))) continue
    const alpha = await profileAlpha(image)
    const inkFraction =
      alpha.character === 'none' || alpha.character === 'unknown'
        ? 1
        : alpha.midFraction + alpha.opaqueFraction
    const bytesPerInkPixel = inkFraction > 0 ? bytesPerPixel / inkFraction : bytesPerPixel
    if (bytesPerInkPixel >= CRUSHED_BYTES_PER_PIXEL) continue
    // A flat one-colour print stores tiny and crisp — see isFlatInk. Decoded only here.
    const detail = await profileInkDetail(image)
    if (detail && isFlatInk(detail)) continue
    crushed.push({
      index,
      name: texture.getName() || texture.getURI() || `#${index}`,
      width,
      height,
      bytes: image.byteLength,
      bytesPerPixel: Math.round(bytesPerPixel * 10000) / 10000,
      inkFraction: Math.round(inkFraction * 1000) / 1000,
      bytesPerInkPixel: Math.round(bytesPerInkPixel * 10000) / 10000,
    })
  }
  return crushed
}

export interface ArtworkAlphaProblem {
  material: string
  /**
   * `blend` = a print the opaque step would have cut out or made solid is still
   * BLEND — the step did not run, or a later pass undid it; `cutoff` = a MASK whose
   * threshold drifted off 0.5.
   */
  problem: 'blend' | 'cutoff'
}

/**
 * A print the pipeline deliberately left translucent. Reported loudly, never
 * refused — see `auditArtworkAlpha`.
 */
export interface SoftArtworkOnBlend {
  material: string
  /**
   * Why `solidifyMaterials` kept it on BLEND: `graded` — soft-edged alpha (a brush
   * stroke, a feathered fade); `sheer-factor` — the material declares itself
   * translucent in baseColorFactor[3], which CLO writes from the graphic's opacity
   * slider; `undecodable` — the picture could not be read, so there was nothing to
   * judge.
   */
  reason: 'graded' | 'sheer-factor' | 'undecodable'
  /** baseColorFactor[3], the declared opacity, 0-1. */
  factor: number
  /** Share of pixels between fully clear and fully solid — how soft the print is. */
  midFraction: number
}

export interface ArtworkAlphaAudit {
  /** Refuse the garment. Structural, no false-positive case. */
  problems: ArtworkAlphaProblem[]
  /** Warn the owner. The pipeline's own considered judgement, stated. */
  soft: SoftArtworkOnBlend[]
}

/** The value `solidifyMaterials` resolves every hard cutout to. */
const EXPECTED_ALPHA_CUTOFF = 0.5

export interface GateClassification {
  /** May this material's alpha state refuse the garment? */
  artwork: boolean
  /** Which strict signal said so. */
  reason: 'name' | 'cutout' | null
  /** Named as thread, seam, zipper or other hardware: never artwork for the gate. */
  excluded: boolean
  /** The base-colour alpha profile when a decodable picture exists; reused by the gate. */
  alpha: AlphaProfile | null
}

/**
 * The STRICT classifier — the only one allowed to refuse a garment.
 *
 * TWO QUESTIONS, TWO ANSWERS. "Does this picture deserve the higher compression
 * budget?" is `isArtworkTexture` below: deliberately generous, because a false
 * positive there costs a few hundred KB and a false negative crushes a print. "May
 * this material's alpha state REFUSE the whole garment?" is this function, and it
 * has to be strict, because a false positive here throws a finished garment away.
 * Until 2026-09-02 one function answered both, and the shrink robot refused two of
 * the owner's five finished garments — AERO-TECH WINDBREAKER and ARMOR-TECH JACKET —
 * over materials named `Default Topstitch_3569` and `Default Topstitch_3296`: CLO's
 * thread strip is 236x39, the generous classifier reads any strip 3x longer than
 * wide as a wordmark BEFORE looking at its alpha, and the refusal message told the
 * owner to re-export artwork that did not exist (audit F2-01, HG-01, B-03, CG-02,
 * CT-06). Re-exporting could never clear it: the shape of the picture is CLO's.
 *
 * The rules, in order:
 *   1. A material named as thread, seam, tape, zipper or hardware is never artwork
 *      here, whatever its picture (`NOT_ARTWORK_NAME`, the list the compression
 *      budget already trusted). The word was in the file all along.
 *   2. A material — or its base-colour or emissive texture — NAMED as artwork is.
 *      Material names, because a CLO export names the MATERIAL and leaves every
 *      texture anonymous (0 of 24 on the Cycling-Bib export).
 *   3. A hard alpha cut-out is: 'binary' alpha is a decal sitting on the garment.
 *   4. SHAPE ALONE NEVER QUALIFIES. A long thin picture with soft alpha is thread
 *      or trim; a wordmark's alpha is binary and rule 3 catches it.
 *
 * Only OPAQUE materials skip the decode — nothing about them can be refused.
 */
export async function classifyArtworkForGate(
  material: Material,
  cache: Map<Texture, AlphaProfile> = new Map(),
): Promise<GateClassification> {
  const name = material.getName() || ''
  const base = material.getBaseColorTexture()
  const emissive = material.getEmissiveTexture()
  const alpha = base ? await profileFor(base, cache) : null
  if (isThreadOrHardwareName(name)) return { artwork: false, reason: null, excluded: true, alpha }
  const byName =
    isArtworkMaterialByName(material) ||
    (base ? isArtworkTextureByName(base) : false) ||
    (emissive ? isArtworkTextureByName(emissive) : false)
  if (byName) return { artwork: true, reason: 'name', excluded: false, alpha }
  if (alpha?.character === 'binary')
    return { artwork: true, reason: 'cutout', excluded: false, alpha }
  return { artwork: false, reason: null, excluded: false, alpha }
}

/** One decode per texture: a CLO export binds one thread strip to hundreds of materials. */
async function profileFor(
  texture: Texture,
  cache: Map<Texture, AlphaProfile>,
): Promise<AlphaProfile | null> {
  const image = texture.getImage()
  if (!image) return null
  const cached = cache.get(texture)
  if (cached) return cached
  const profile = await profileAlpha(image)
  cache.set(texture, profile)
  return profile
}

/**
 * Artwork materials whose alpha ended up wrong — and the ones left soft on purpose.
 *
 * <model-viewer> has no order-independent transparency, so a BLEND material
 * renders see-through and depth-sorts badly — literally the "half visible, half
 * not" in the original report. `solidifyMaterials` resolves hard cutouts to MASK
 * with alphaCutoff 0.5 (H3 in docs/OPEN-ISSUE-ARTWORK.md), but nothing checked
 * the OUTPUT, so a decal that slipped through as BLEND — or a MASK whose cutoff
 * drifted — shipped in silence.
 *
 * WHAT REFUSES, SINCE 2026-09-02. A material still on BLEND is a `blend` problem
 * only when `resolveBlendAlpha` — the very function solidifyMaterials applies —
 * says it should have been changed. That is a real regression: the opaque step did
 * not run, or a later pass undid it, and the same input would fail again. When
 * that function says `keep`, the pipeline chose to leave the print translucent
 * (soft-edged alpha, an explicit sheer factor, or an undecodable picture) and the
 * material is reported in `soft` for the owner to look at, never refused. The
 * audit's finding 5 was that on a normal run the old gate could only ever fire on
 * the decision it was policing, or on misclassified thread; this makes that
 * explicit. The MASK-cutoff-off-0.5 refusal is unchanged.
 *
 * Scoped to artwork deliberately. A sheer mesh panel is *supposed* to be BLEND;
 * flagging every translucent material would make this noise, and the existing
 * `translucentMaterialCount` already reports that broader number.
 */
export async function auditArtworkAlpha(document: Document): Promise<ArtworkAlphaAudit> {
  const problems: ArtworkAlphaProblem[] = []
  const soft: SoftArtworkOnBlend[] = []
  const cache = new Map<Texture, AlphaProfile>()
  for (const material of document.getRoot().listMaterials()) {
    const mode = material.getAlphaMode()
    if (mode === 'OPAQUE') continue
    const classification = await classifyArtworkForGate(material, cache)
    if (!classification.artwork) continue
    const name = material.getName() || '(unnamed material)'
    if (mode === 'MASK') {
      if (material.getAlphaCutoff() !== EXPECTED_ALPHA_CUTOFF) {
        problems.push({ material: name, problem: 'cutoff' })
      }
      continue
    }
    // BLEND: ask the solidify decision itself. An untextured material gets the same
    // no-pixels profile solidifyMaterials gives it.
    const factor = material.getBaseColorFactor()[3] ?? 1
    const alpha = classification.alpha ?? NO_ALPHA_PROFILE
    if (resolveBlendAlpha(alpha, factor) !== 'keep') {
      problems.push({ material: name, problem: 'blend' })
      continue
    }
    const reason: SoftArtworkOnBlend['reason'] =
      alpha.character === 'unknown'
        ? 'undecodable'
        : factor < OPAQUE_FACTOR_THRESHOLD
          ? 'sheer-factor'
          : 'graded'
    soft.push({ material: name, reason, factor, midFraction: alpha.midFraction })
  }
  return { problems, soft }
}

/** The refusals only. Kept for the sweep and eval scripts; validate.ts uses the audit. */
export async function findArtworkAlphaProblems(document: Document): Promise<ArtworkAlphaProblem[]> {
  return (await auditArtworkAlpha(document)).problems
}

/** The warnings only. */
export async function findSoftArtworkOnBlend(document: Document): Promise<SoftArtworkOnBlend[]> {
  return (await auditArtworkAlpha(document)).soft
}

/**
 * The GENEROUS classifier: does this picture deserve the higher compression budget?
 * Feeds `compressTexturesForArtwork` and the crushed-artwork warning. Since
 * 2026-09-02 it feeds NO blocking gate — see `classifyArtworkForGate`.
 */
export async function isArtworkTexture(texture: Texture): Promise<boolean> {
  if (isDataTexture(texture)) return false
  if (isArtworkTextureByName(texture)) return true

  const image = texture.getImage()
  if (!image) return false

  try {
    const { width, height } = await sharp(image).metadata()
    // Wordmarks and printed bands are long thin strips; fabric maps are square.
    // The real file had 853x142 and 1944x121 textures — 6:1 and 16:1.
    if (
      width &&
      height &&
      Math.max(width, height) / Math.min(width, height) >= ARTWORK_ASPECT_RATIO
    ) {
      return true
    }
  } catch {
    return false
  }

  // A hard alpha cutout means a decal sitting on the garment rather than a
  // fabric map. Graded alpha is sheer fabric; absent or solid alpha is neither.
  return (await profileAlpha(image)).character === 'binary'
}

/**
 * Re-encode every decodable texture to WebP, artwork at higher fidelity.
 *
 * Runs before decimation, matching where `textureCompress` sat in the chain.
 */
export function compressTexturesForArtwork(options: ArtworkTextureOptions): Transform {
  return createTransform(
    'compressTexturesForArtwork',
    async (document: Document): Promise<void> => {
      // ⚠️ THE SIGNAL THAT RESCUES 8 GARMENTS. Computed once per document, from UV
      // spans alone — no decode, no names. Measured across all 28 raw exports:
      // 8 garments have ZERO materials matching the artwork word list, because
      // their artwork is called `ZZ00000ZZZZ0`, `76197`, `01`, `Untitled-1` or
      // `ルン ろご。`, and their printed graphics were taking the FABRIC budget.
      // See artwork-geometry.ts for the measurement and for why this must never
      // reach `findArtworkAlphaProblems`, which is a blocking gate.
      const artworkByGeometry = findArtworkTexturesByGeometry(document)

      // Textures whose material solidifyMaterials has already resolved to MASK.
      // Those are the ones alphaCutoff 0.5 will cut, and the only ones worth
      // rescaling — see alpha-coverage.ts.
      const cutoutTextures = new Set<Texture>()
      for (const material of document.getRoot().listMaterials()) {
        if (material.getAlphaMode() !== 'MASK') continue
        const base = material.getBaseColorTexture()
        if (base) cutoutTextures.add(base)
      }

      const result: TextureArtworkResult = {
        artwork: 0,
        standard: 0,
        skipped: 0,
        artworkNames: [],
        alphaBoosted: [],
        artworkResized: [],
      }

      for (const texture of document.getRoot().listTextures()) {
        const image = texture.getImage()
        if (!image || !DECODABLE.has(texture.getMimeType())) {
          result.skipped++
          continue
        }

        // Either signal is enough. The name check is narrow and precise; the
        // geometric one is language-independent and catches what no word list can.
        // Their failure directions are the same and safe: a false positive gives
        // fabric a higher quality budget, which costs bytes and damages nothing.
        const artwork = artworkByGeometry.has(texture) || (await isArtworkTexture(texture))
        // A texture used ONLY as normal/ORM/occlusion gets its own, smaller cap.
        // `isDataTexture` requires EVERY slot to be a data slot, so a map that is
        // also somebody's baseColor keeps the full colour cap and is never
        // silently downsampled underneath the artwork that shares it.
        const data = !artwork && isDataTexture(texture)
        const maxSize = artwork
          ? options.artworkMaxSize
          : data
            ? (options.dataMaxSize ?? options.maxSize)
            : options.maxSize
        const quality = artwork ? options.artworkQuality : options.quality

        try {
          // Measured only for artwork, and only to report it: a wordmark that had
          // to be resampled has lost stroke detail, and that should be a sentence
          // in the owner's report rather than something that just happens. Fabric
          // resizing is routine and reporting it would be noise.
          const before = artwork ? await sharp(image).metadata() : null

          const webpOptions = {
            quality,
            // Alpha is the decal's shape. Compressing it is what turns a crisp
            // cutout into a fringed one, and it is cheap to keep.
            alphaQuality: artwork ? 100 : 90,
            // libwebp's "Sharp YUV". Costs no size and directly targets the
            // 4:2:0 chroma bleed that damages saturated edges.
            smartSubsample: true,
            effort: 6,
          }
          const resized = sharp(image).resize(maxSize, maxSize, {
            fit: 'inside',
            withoutEnlargement: true,
          })

          // ⚠️ AFTER THE RESIZE, BEFORE THE ENCODE. Downsampling lowers the peak
          // alpha of a thin stroke, so the coverage has to be measured on the
          // pixels that will actually ship — measuring the original and rescaling
          // the resized one would preserve the wrong number.
          let encoded: Buffer
          let info: OutputInfo
          if (artwork && cutoutTextures.has(texture)) {
            const raw = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
            const channels = raw.info.channels
            const pixels = raw.info.width * raw.info.height
            const alpha = new Uint8Array(pixels)
            for (let i = 0, j = channels - 1; i < pixels; i++, j += channels) {
              alpha[i] = raw.data[j] ?? 0
            }
            const boost = alphaBoostForCoverage(alpha, EXPECTED_ALPHA_CUTOFF)
            if (boost > 1) {
              applyAlphaBoost(alpha, boost)
              for (let i = 0, j = channels - 1; i < pixels; i++, j += channels) {
                raw.data[j] = alpha[i] ?? 0
              }
              result.alphaBoosted.push(
                texture.getName() || texture.getURI() || `#${result.artwork + 1}`,
              )
            }
            const out = await sharp(raw.data, {
              raw: { width: raw.info.width, height: raw.info.height, channels },
            })
              .webp(webpOptions)
              .toBuffer({ resolveWithObject: true })
            encoded = out.data
            info = out.info
          } else {
            const out = await resized.webp(webpOptions).toBuffer({ resolveWithObject: true })
            encoded = out.data
            info = out.info
          }

          if (
            before?.width &&
            before.height &&
            (info.width < before.width || info.height < before.height)
          ) {
            result.artworkResized.push(
              texture.getName() || texture.getURI() || `#${result.artwork + 1}`,
            )
          }

          texture.setImage(new Uint8Array(encoded)).setMimeType('image/webp')
          const uri = texture.getURI()
          if (uri) texture.setURI(uri.replace(/\.[a-z0-9]+$/i, '.webp'))

          if (artwork) {
            result.artwork++
            result.artworkNames.push(texture.getName() || texture.getURI() || `#${result.artwork}`)
          } else {
            result.standard++
          }
        } catch {
          // A texture that will not decode is left exactly as it was, rather than
          // dropped — a missing logo is worse than an unoptimised one.
          result.skipped++
        }
      }

      // ⚠️ DECLARE EXT_texture_webp, OR EVERY OUTPUT IS INVALID glTF. Writing
      // `image/webp` into a texture is not enough: the spec requires the file to
      // list the extension in `extensionsUsed`, and a texture whose mime-type is
      // not a core one (PNG/JPEG) is otherwise illegal. Found 2026-08-27 the first
      // time the Khronos validator ran on our own output — every processed garment
      // failed, and had for as long as the WebP pass has existed:
      //
      //   p001    44 errors   arisan  38 errors   n001  42 errors   geovent 45
      //   IMAGE_NON_ENABLED_MIME_TYPE + TEXTURE_INVALID_IMAGE_MIME_TYPE, in pairs
      //
      // Nothing caught it because <model-viewer> sniffs the bytes and renders
      // anyway. A stricter runtime — Quick Look for AR, another engine — is
      // entitled to refuse the texture, and every gate in this repo was green.
      // NOT setRequired: a reader that cannot do WebP should still load the
      // geometry rather than reject the whole file.
      if (result.artwork + result.standard > 0) {
        const existing = document
          .getRoot()
          .listExtensionsUsed()
          .some((e) => e.extensionName === EXTTextureWebP.EXTENSION_NAME)
        if (!existing) document.createExtension(EXTTextureWebP).setRequired(false)
      }

      options.onResult?.(result)
      document
        .getLogger()
        .debug(
          `compressTexturesForArtwork: ${result.artwork} artwork, ${result.standard} standard, ${result.skipped} skipped.`,
        )
    },
  )
}
