import type { ViewerColourway } from '@run-apparel/shared'
import { useState } from 'react'
import { isCoarsePointer } from '../lib/capabilities'

interface ColourwayTabsProps {
  colourways: ViewerColourway[]
  selected: ViewerColourway
  onSelect: (colourway: ViewerColourway) => void
}

export function ColourwayTabs({ colourways, selected, onSelect }: ColourwayTabsProps) {
  // Hover/focus static preview — fine pointers only; first tap selects on touch.
  const [previewed, setPreviewed] = useState<ViewerColourway | null>(null)
  const showPreview = previewed && previewed.slug !== selected.slug && !isCoarsePointer()

  return (
    <section className="colourways" aria-label="Colourways" data-reveal>
      <div className="colourways__preview" aria-hidden="true">
        {showPreview && (
          <div className="colourway-preview">
            <img
              src={previewed.poster.url}
              alt=""
              width={previewed.poster.width ?? undefined}
              height={previewed.poster.height ?? undefined}
              loading="lazy"
              decoding="async"
            />
          </div>
        )}
      </div>
      <div className="colourways__list" role="tablist" aria-label="Select colourway">
        {colourways.map((colourway, index) => (
          <button
            key={colourway.variantId}
            type="button"
            role="tab"
            className="colourway-tab"
            aria-selected={colourway.slug === selected.slug}
            onClick={() => onSelect(colourway)}
            onMouseEnter={() => setPreviewed(colourway)}
            onMouseLeave={() => setPreviewed(null)}
            onFocus={() => setPreviewed(colourway)}
            onBlur={() => setPreviewed(null)}
          >
            <span className="colourway-tab__num">{String(index + 1).padStart(2, '0')}</span>
            {colourway.displayName}
          </button>
        ))}
      </div>
      <p className="colourways__hint">YOUR COLOURWAY IS ALWAYS DEVELOPED AROUND YOUR BRIEF.</p>
    </section>
  )
}
