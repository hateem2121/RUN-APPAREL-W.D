import type { ReactNode } from 'react'

/**
 * Display heading with one Instrument Serif italic accent word
 * (docs/DESIGN.md § Type: 1–2 per headline, lowercase, volt-deep/volt). The last
 * word of a dynamic heading carries the accent.
 */
export function headingWithAccent(text: string): ReactNode {
  const words = text.trim().split(/\s+/)
  if (words.length < 2) return text
  const accent = words.pop()!
  return (
    <>
      {words.join(' ')} <span className="serif-accent">{accent.toLowerCase()}</span>
    </>
  )
}
