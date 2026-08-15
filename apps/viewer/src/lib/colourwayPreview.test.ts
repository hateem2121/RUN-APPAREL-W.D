import type { ViewerColourway } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { displayedColourway } from './colourwayPreview'

const colourway = (slug: string): ViewerColourway =>
  ({
    variantId: `Colorway ${slug}`,
    displayName: slug,
    slug,
    sequence: 1,
    poster: { url: `/${slug}.webp`, alt: '', width: 1200, height: 1500, mimeType: 'image/webp' },
    glbUrl: `/${slug}.glb`,
    isDefault: false,
    altText: slug,
    hexSwatch: '#825353',
  }) as ViewerColourway

const maroon = colourway('maroon')
const blush = colourway('blush')

describe('displayedColourway', () => {
  it('shows the hovered colourway when one is being previewed', () => {
    expect(displayedColourway(false, blush, maroon)).toBe(blush)
  })

  it('falls back to the selected colourway when nothing is hovered', () => {
    expect(displayedColourway(false, null, maroon)).toBe(maroon)
  })

  it('IGNORES the preview under separate-glb-per-colour', () => {
    // The guard that matters. There, a colourway is a separate FILE rather than
    // a variant inside one: honouring a hover would fetch a multi-megabyte GLB
    // because a pointer crossed a button, and would disagree with the `src`
    // <Stage> resolved from the selection. Deleting the guard still renders
    // correctly on N001 — which is single-glb-variants — so nothing else here
    // would catch it.
    expect(displayedColourway(true, blush, maroon)).toBe(maroon)
  })
})

/*
 * `shouldShowThumbnail`'s five cases lived here until 2026-08-15 and were deleted
 * with the function, not skipped. The hover thumbnail is gone by owner decision;
 * see the header of `components/ColourwayTabs.tsx`.
 *
 * `blush` is still constructed above and used by the suite that remains — do not
 * "tidy" it away on the assumption it belonged to the deleted block.
 */
