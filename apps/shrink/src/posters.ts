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
}

/** One colour to photograph, and the filename its poster must be saved as. */
export interface PosterTarget {
  slug: string
  variantId: string
  filename: string
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
