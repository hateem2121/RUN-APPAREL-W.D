import type { ViewerColourway } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { displayedColourway, shouldShowThumbnail } from './colourwayPreview'

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

describe('shouldShowThumbnail', () => {
  it('shows it while the model cannot yet accept a variant swap', () => {
    expect(shouldShowThumbnail(true, false, blush, maroon)).toBe(true)
  })

  it('hides it once the model is up — the garment itself is the preview', () => {
    // Not cosmetic: the model is 27 MB and fills the viewport, so a 132px copy
    // of the same colour in the corner is noise competing with the real thing.
    expect(shouldShowThumbnail(true, true, blush, maroon)).toBe(false)
  })

  it('never shows it on a coarse pointer', () => {
    // Touch has no hover. The first tap fires mouseenter AND click, so a preview
    // state is invisible and, if it lingered, would contradict the selection.
    expect(shouldShowThumbnail(false, false, blush, maroon)).toBe(false)
  })

  it('does not show it for the already-selected colourway', () => {
    expect(shouldShowThumbnail(true, false, maroon, maroon)).toBe(false)
  })

  it('does not show it when nothing is hovered', () => {
    expect(shouldShowThumbnail(true, false, null, maroon)).toBe(false)
  })
})
