/**
 * Which colours should this run photograph, and what should each file be
 * called?
 *
 * Modelled directly on planModelAttach (./attach.ts) and planColourImport
 * (./colourImport.ts) — same shape, same reporting-rather-than-throwing
 * register, same two-refusal safety argument. Read attach.ts's header first;
 * this restates only what is specific to posters. Unlike its two siblings
 * this returns a plain array rather than a tagged union, because there is
 * only one interesting outcome here (a list of targets, possibly empty) and
 * no note to hand back — index.ts writes its OWN report line once it knows
 * how many captures actually succeeded, which this function cannot know.
 *
 * WHY PHOTOGRAPH AT ALL. The publish gate refuses any switched-on colour with
 * no photo, and a single garment can carry up to 10 colourways — up to 1,000
 * photographs by hand across a 100+ garment catalogue. The robot already has
 * the model open and already knows every colourway inside it (that is what
 * this same job's fileColours write, a few lines up in index.ts, reports), so
 * it can take the photos itself instead of leaving an empty box for the owner
 * to fill in by hand, up to ten times per garment.
 *
 * THE TWO REFUSALS BELOW ARE THE WHOLE SAFETY ARGUMENT, not caution — the
 * same two kinds planModelAttach and planColourImport already use:
 *
 *   - `published`. `colourways` is in the CMS's GATED_FIELDS, so writing
 *     `posterPreview` on it re-runs the publish gate. On a draft
 *     `assertPublishable` returns on its first line, so the write cannot
 *     throw. On a LIVE product it can — and a gate rejecting the robot's own
 *     write is exactly the 2026-07-29 bug GATED_FIELDS exists to prevent.
 *     Never write to a published one.
 *   - a photo the owner already supplied. Replacing it is a surprise, not a
 *     convenience — this feature exists to remove typing, never to overrule a
 *     human's own choice of picture.
 */

/** What the target product looks like right now. */
export interface PosterProduct {
  code: string | null
  status: string | null
}

/** One colour row, reduced to what this decision needs. */
export interface PosterColourway {
  slug: string
  variantId: string
  hasPoster: boolean
  /**
   * The colour measured out of the file at import (importColours.ts), or null
   * when the owner built the row by hand. Carried through only so
   * `checkCapturedFrame` can tell "these two colours ARE different" from
   * "these two colours might genuinely look alike" — it takes no part in
   * deciding what to photograph.
   */
  hexSwatch: string | null
}

/** One colour to photograph, and the filename its poster must be saved as. */
export interface PosterTarget {
  slug: string
  variantId: string
  filename: string
}

/** One poster that has actually been taken, as `checkCapturedFrame` sees it. */
export interface CapturedFrame {
  slug: string
  hexSwatch: string | null
  /** `frameDigest` of the PNG bytes. */
  digest: string
}

export function planPosters(product: PosterProduct, colourways: PosterColourway[]): PosterTarget[] {
  if (product.status === 'published') return []

  const code = (product.code ?? '').trim()
  if (code === '') return []

  const targets: PosterTarget[] = []
  for (const colour of colourways) {
    // Never replace a photo the owner supplied. The point is to remove
    // typing, not to overrule a decision.
    if (colour.hasPoster) continue

    // No variant to select inside the file → nothing for /render to show.
    const variantId = colour.variantId.trim()
    if (variantId === '') continue

    // No web address word yet (an imported low-confidence row arrives this
    // way on purpose — see colourImport.ts) → no filename to give it and no
    // page for a human to find it on yet either.
    const slug = colour.slug.trim()
    if (slug === '') continue

    targets.push({
      slug,
      variantId,
      // isValidProductCode (Products.ts) confines `code` to capital letters
      // and digits, and isValidSlug confines `slug` to lowercase letters,
      // digits and hyphens — so this join can never produce anything
      // checkMediaUpload's /^[A-Za-z0-9._-]+$/ would reject a 400 for. Pinned
      // by a test rather than trusted, per the task 14 brief.
      filename: `${code.toLowerCase()}-${slug}-poster.png`,
    })
  }
  return targets
}

/**
 * A cheap content fingerprint for a captured PNG.
 *
 * FNV-1a over the bytes, with the length folded in, rendered as hex. NOT a
 * cryptographic digest and not trying to be: the only question asked of it is
 * "are these two frames the same frame", across at most ten posters in one
 * garment, where a collision is both vanishingly unlikely and costs a spurious
 * warning rather than a wrong poster.
 *
 * Synchronous and pure, deliberately — `crypto.subtle.digest` would be the
 * obvious reach, and it is async, which would put an `await` inside the capture
 * loop for a diagnostic. This stays testable without a browser or a Worker
 * runtime, which is the same split planPosters exists for.
 */
export function frameDigest(bytes: Uint8Array): string {
  // 32-bit FNV-1a. Math.imul does the 32-bit multiply JS otherwise loses to
  // float precision; `>>> 0` keeps the result unsigned.
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i] as number
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${bytes.length.toString(16)}-${hash.toString(16)}`
}

/** Two swatches that are both present and genuinely different. */
function swatchesDiffer(a: string | null, b: string | null): boolean {
  const left = (a ?? '').trim().toLowerCase()
  const right = (b ?? '').trim().toLowerCase()
  // A missing swatch is not evidence. Rows the owner typed by hand have none,
  // and a false alarm on a hand-built garment teaches them to ignore the
  // warning — worse than not having it.
  if (left === '' || right === '') return false
  return left !== right
}

/**
 * Has this poster already been taken, under another colour's name?
 *
 * Returns a sentence for the owner's report, or null when the frame is new.
 * WARNING ONLY — it never refuses a capture and never throws. The poster is
 * still uploaded and still linked: this reports a suspicion, and the whole
 * point of the finding it comes from is that only a human looking at the
 * picture can settle it.
 *
 * WHAT IT CATCHES (post-merge review of 8927062, finding 3.4). The frame is
 * painted before the newly-selected variant's textures reach the GPU, so the
 * PREVIOUS colour is photographed under the new colour's name. `variantName`
 * was set, the variant exists, the row is resolved by slug — every existing
 * guard passes, because none of them looks at the picture. The settle is
 * jumpCameraToGoal plus two rAFs, which root CLAUDE.md describes as
 * best-effort rather than a convergence check.
 *
 * Identity, not colour distance: Workers cannot run sharp (see index.ts's
 * screenshot call), and two colourways producing byte-identical PNGs states
 * the bug exactly without decoding anything. Byte-identical renders are the
 * norm here for identical input — root CLAUDE.md records four such PNGs at
 * `sha256 294291db…` — so this is signal rather than noise.
 *
 * Always reported against the FIRST frame with that digest: a stuck swap
 * repeats one image across several colours, and the first one is the colour
 * that is actually correct.
 */
export function checkCapturedFrame(seen: CapturedFrame[], frame: CapturedFrame): string | null {
  const earlier = seen.find((candidate) => candidate.digest === frame.digest)
  if (!earlier) return null

  const shared = `“${frame.slug}” photographed to a picture identical to “${earlier.slug}”`
  return swatchesDiffer(earlier.hexSwatch, frame.hexSwatch)
    ? `${shared}, but the file says they are different colours — one of the two photos is ` +
        'almost certainly showing the wrong colour. Check both on the Colours tab.'
    : `${shared}. They share the same swatch in the file, so this may be correct — check both ` +
        'on the Colours tab.'
}
