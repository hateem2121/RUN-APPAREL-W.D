/**
 * The width a picture's `sizes` hint names on a window `width` px wide, worked out without a browser,
 * for the unit tests that check which file a screen is handed (`factoryPhotos.test.ts`,
 * `lib/cardImage.test.ts`). The browser suites measure the same hints against the boxes really
 * drawn (`e2e/sizesHint.ts`); this answers the question a browser asks first, before layout.
 *
 * Only the forms the site writes: `(max-width: Npx)` conditions, then `Npx`, `Nvw` or
 * `calc(Nvw ± Npx)`. Anything else THROWS, so a new form cannot be read as some other width.
 */

function lengthAt(length: string, width: number): number {
  const px = length.match(/^(\d+(?:\.\d+)?)px$/)
  if (px) return Number(px[1])
  const vw = length.match(/^(\d+(?:\.\d+)?)vw$/)
  if (vw) return (Number(vw[1]) * width) / 100
  const sum = length.match(/^calc\((\d+(?:\.\d+)?)vw ([+-]) (\d+(?:\.\d+)?)px\)$/)
  if (sum) return (Number(sum[1]) * width) / 100 + (sum[2] === '+' ? 1 : -1) * Number(sum[3])
  throw new Error(`a sizes length this check cannot read: "${length}"`)
}

/** The first entry of `sizes` whose condition holds on a window `width` px wide, in CSS px. */
export function hintAt(sizes: string, width: number): number {
  for (const entry of sizes.split(/,\s*/)) {
    const [, max, length] = entry.trim().match(/^(?:\(max-width: (\d+)px\)\s+)?(.+)$/) ?? []
    if (max !== undefined && width > Number(max)) continue
    if (length !== undefined) return lengthAt(length, width)
  }
  throw new Error(`no entry of "${sizes}" applies at ${width}px`)
}

/**
 * The `w` a screen of `density` takes from `srcset`: the smallest whose density reaches the
 * screen's, else the largest. Chromium (`SelectionLogic`, with `SrcsetSelectionMatchesImageSet`
 * stable) and WebKit (`pickBestImageCandidate`) both choose this way (their sources, read
 * 2026-10-05).
 */
export function pickedWidth(srcset: string, hint: number, density: number): number {
  const widths = srcset
    .split(', ')
    .map((candidate) => Number(candidate.match(/ (\d+)w$/)?.[1]))
    .sort((a, b) => a - b)
  return widths.find((each) => each / hint >= density) ?? widths.at(-1) ?? 0
}
