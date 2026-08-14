import type { ReactNode } from 'react'

/**
 * Display heading with one Instrument Serif italic accent word
 * (docs/DESIGN.md § Type: 1–2 per headline, lowercase, volt-deep/volt).
 *
 * ⚠️ WHICH WORD IS NOW THE CALLER'S CHOICE — changed 2026-08-14 by owner
 * decision, and it replaces a rule this file previously stated as absolute.
 *
 * It always took the LAST word. That is right for a sentence, where the last
 * word is the one the line lands on: "This reference is no longer `live`",
 * "Develop this garment with `us`". It is wrong for a PRODUCT NAME, because
 * every product in this catalogue ends in its garment type — so the accent
 * landed on "skinsuit", "jacket", "tee", every time, on the least distinctive
 * word available while the model name sat in plain uppercase beside it.
 *
 * Neither position is correct everywhere, which is why this is a parameter
 * rather than a new absolute rule. The default is unchanged, so every existing
 * caller behaves exactly as before.
 */
export type AccentPosition = 'last' | 'first'

export function headingWithAccent(text: string, position: AccentPosition = 'last'): ReactNode {
  const words = text.trim().split(/\s+/)
  if (words.length < 2) return text

  if (position === 'first') {
    const [accent, ...rest] = words
    return (
      <>
        <span className="serif-accent">{(accent ?? '').toLowerCase()}</span> {rest.join(' ')}
      </>
    )
  }

  const accent = words.pop()
  return (
    <>
      {words.join(' ')} <span className="serif-accent">{(accent ?? '').toLowerCase()}</span>
    </>
  )
}
