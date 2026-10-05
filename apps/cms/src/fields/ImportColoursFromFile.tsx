'use client'

import { useForm, useFormFields } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'
import { useState } from 'react'
import type { ExistingRow } from '@run-apparel/shared'
import {
  fileColourLabel,
  formCategory,
  missingFileColours,
  rowsToAdd,
  toSubFieldState,
} from './colourImportPanel'
import { rowsFromFormState } from './formStateRows'

/**
 * "We found colours in your file that are not on your website yet."
 *
 * N001's uploaded file held five colourways; three were mapped and two were
 * invisible to every buyer, with nothing in the admin hinting they existed. The
 * only way to find out was to open the GLB.
 *
 * All the rules live in packages/shared/src/importColours.ts (moved there
 * 2026-08-10 so apps/shrink/src/colourImport.ts can reuse them without
 * duplicating them), which is pure and unit-tested — most importantly that this
 * never rewrites an existing slug (printed on QR tags), never reorders rows (the
 * first switched-on row is the default colourway), and never switches anything
 * on. This file is the shell around it.
 */
export const ImportColoursFromFile: UIFieldClientComponent = () => {
  // The whole form state, read the way ReadinessPanel reads it: an array field's own value
  // is its ROW COUNT, so the rows are rebuilt from their flattened cells (colourImportPanel.ts).
  const fields = useFormFields(([f]) => f as Record<string, { value?: unknown }>)
  const { addFieldRow } = useForm()
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [added, setAdded] = useState(0)

  const missing = missingFileColours(fields)
  const category = formCategory(fields)

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
    const existing = rowsFromFormState(fields, 'colourways') as ExistingRow[]
    // Appended at the end, one ADD_ROW each — the same action Payload's own "Add Colour"
    // button uses — so no existing row moves (row order decides the default colour).
    for (const row of rowsToAdd(chosen, existing, category)) {
      addFieldRow({
        path: 'colourways',
        schemaPath: 'colourways',
        subFieldState: toSubFieldState(row),
      })
    }
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
              <strong>{fileColourLabel(colour, category)}</strong>{' '}
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
