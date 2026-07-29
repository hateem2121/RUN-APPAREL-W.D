'use client'

import { useRowLabel } from '@payloadcms/ui'

/**
 * Row label for the Product → Colours array.
 *
 * Payload's default is "Colour 01", "Colour 02" — which tells the owner nothing
 * about which row is which when five are collapsed. This renders "01 · Navy"
 * instead, and marks retired rows so a switched-off colour is obvious without
 * expanding it.
 */
export const ColourRowLabel = () => {
  const { data, rowNumber } = useRowLabel<{ displayName?: string; active?: boolean }>()
  const position = String((rowNumber ?? 0) + 1).padStart(2, '0')
  const name = data?.displayName?.trim() || 'Untitled colour'
  // `active` defaults to true, so only an explicit false is "hidden".
  const hidden = data?.active === false
  return (
    <span>
      {position} · {name}
      {hidden ? ' — hidden from the website' : ''}
    </span>
  )
}
