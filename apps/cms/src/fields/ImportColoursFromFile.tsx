'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'
import { useState } from 'react'
import {
  type ExistingRow,
  type FileColour,
  buildImportedRow,
  toFileColours,
  unmappedFileColours,
} from './importColours'

/**
 * "We found colours in your file that are not on your website yet."
 *
 * N001's uploaded file held five colourways; three were mapped and two were
 * invisible to every buyer, with nothing in the admin hinting they existed. The
 * only way to find out was to open the GLB.
 *
 * All the rules live in ./importColours.ts, which is pure and unit-tested — most
 * importantly that this never rewrites an existing slug (printed on QR tags),
 * never reorders rows (the first switched-on row is the default colourway), and
 * never switches anything on. This file is the shell around it.
 */
export const ImportColoursFromFile: UIFieldClientComponent = () => {
  const { value: rows, setValue: setRows } = useField<Record<string, unknown>[]>({
    path: 'colourways',
  })
  const fileColourDetails = useFormFields(([fields]) => fields?.fileColourDetails?.value)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [added, setAdded] = useState(0)

  const existing: ExistingRow[] = Array.isArray(rows) ? (rows as ExistingRow[]) : []
  const missing = unmappedFileColours(toFileColours(fileColourDetails), existing)

  if (missing.length === 0) {
    return added > 0 ? (
      <div className="field-description">
        Added {added} colour{added === 1 ? '' : 's'}. They are switched off until you tick “Show
        this colour on the website”, so nothing has changed for buyers yet.
      </div>
    ) : null
  }

  const add = () => {
    const chosen = missing.filter((colour) => ticked[colour.variantId])
    if (chosen.length === 0) return
    // Append only, and re-read the growing list each time so two imported rows
    // cannot claim the same slug.
    const next = [...existing] as Record<string, unknown>[]
    for (const colour of chosen) {
      next.push(
        buildImportedRow(colour, next as ExistingRow[]) as unknown as Record<string, unknown>,
      )
    }
    setRows(next)
    setAdded(chosen.length)
    setTicked({})
  }

  return (
    <div className="field-type">
      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
        We found {missing.length} colour{missing.length === 1 ? '' : 's'} in your file that{' '}
        {missing.length === 1 ? 'is' : 'are'} not on your website yet.
      </p>
      <p className="field-description" style={{ marginTop: 0 }}>
        Tick the ones you want to sell. They are added switched off, so nothing appears for buyers
        until you turn them on.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0' }}>
        {missing.map((colour) => (
          <li
            key={colour.variantId}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}
          >
            <input
              type="checkbox"
              id={`import-${colour.variantId}`}
              checked={Boolean(ticked[colour.variantId])}
              onChange={(event) =>
                setTicked((prev) => ({ ...prev, [colour.variantId]: event.target.checked }))
              }
            />
            <span
              aria-hidden="true"
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: colour.hex,
                border: '1px solid rgba(0,0,0,.25)',
                flex: '0 0 auto',
              }}
            />
            <label htmlFor={`import-${colour.variantId}`}>
              <strong>{label(colour)}</strong>{' '}
              <span style={{ opacity: 0.7 }}>
                {colour.hex} · called “{colour.variantId}” in your file
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--style-secondary" onClick={add}>
        Add the ticked colours
      </button>
    </div>
  )
}

/**
 * A low-confidence match shows its swatch and says so, rather than offering a
 * name. Suggesting one confidently is exactly how a maroon garment came to be
 * called Navy.
 */
function label(colour: FileColour): string {
  return colour.confidence === 'high' ? colour.name : 'Colour needs a name'
}
