/**
 * The pure checks behind the two writes the 2026-09-27 rollout makes to LIVE garments —
 * `scripts/swap-live-model.mjs` (point a product at a re-processed model) and
 * `scripts/attach-renders.mjs` (an HD render on each colour). Tested in
 * `apps/cms/src/liveGarmentWrites.test.ts` without a network or a key.
 *
 * Both write to a page buyers are looking at, and `colourways` is an inline array a PATCH
 * REPLACES whole (`.claude/rules/cms-scripted-writes.md`): a row sent without its `id`, or in
 * a new order, re-points printed QR tags. So each function returns what is wrong rather than
 * trying to repair it, and the scripts refuse on anything but an empty answer.
 */

/**
 * Why the swap must not happen, or an empty list when it may.
 *
 * The robot never swaps a live model by itself (apps/shrink/src/attach.ts); the owner
 * approved this one ("re-process all 16"), and these are the conditions under which the
 * swap cannot change what a buyer's colour tabs point at.
 *
 * @param {{
 *   product: { status?: unknown, glbAsset?: unknown, colourways?: Array<{ variantId?: unknown }> },
 *   mediaId: number,
 *   media: { filesize?: unknown, mimeType?: unknown },
 *   servedBytes: number,
 *   fileColours: string[],
 * }} input
 * @returns {string[]}
 */
export function swapProblems({ product, mediaId, media, servedBytes, fileColours }) {
  const problems = []
  if (product.status !== 'published')
    problems.push(`the product is ${product.status ?? 'unknown'}, not published`)
  if (String(product.glbAsset) === String(mediaId))
    problems.push(`Media #${mediaId} is already the live model`)
  if (media.mimeType !== 'model/gltf-binary')
    problems.push(`Media #${mediaId} is ${media.mimeType}, not a GLB`)
  if (servedBytes !== media.filesize)
    problems.push(
      `Media #${mediaId} served ${servedBytes} bytes to a plain GET, not its ${media.filesize}`,
    )
  // A different colour set flips variantsVerified and strands every colour tab.
  const live = (product.colourways ?? []).map((row) => String(row.variantId ?? ''))
  const missing = live.filter((id) => !fileColours.includes(id))
  const extra = fileColours.filter((id) => !live.includes(id))
  if (missing.length || extra.length)
    problems.push(
      'the new file’s colours differ from the live ones' +
        (missing.length ? ` — missing ${missing.join(', ')}` : '') +
        (extra.length ? ` — not live: ${extra.join(', ')}` : ''),
    )
  return problems
}

/**
 * The full colourways array with `renderImage` set from `{ <colour slug>: <media id> }`,
 * every other field and the ORDER untouched. A colour absent from the map keeps whatever it
 * had; a slug in the map that the product does not have is refused, because a typo would
 * otherwise attach nothing and report success.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {Record<string, number>} bySlug
 * @returns {Array<Record<string, unknown>> | { error: string }}
 */
export function renderRows(rows, bySlug) {
  if (rows.some((row) => typeof row.id !== 'string' || row.id === ''))
    return { error: 'a colour row has no id — sending it would re-create the row, not update it' }
  const slugs = new Set(rows.map((row) => row.slug))
  const unknown = Object.keys(bySlug).filter((slug) => !slugs.has(slug))
  if (unknown.length) return { error: `no colour with the slug ${unknown.join(', ')}` }
  return rows.map((row) =>
    Object.hasOwn(bySlug, String(row.slug)) ? { ...row, renderImage: bySlug[row.slug] } : row,
  )
}
