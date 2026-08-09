'use client'

import { FieldLabel, SelectInput, useField, useFormFields } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'

/**
 * "Which colour in your CLO file is this?"
 *
 * The owner used to have to name colourways inside CLO 3D as `N001-NAVY` etc,
 * character for character, because the merged GLB's KHR_materials_variants names
 * had to match the CMS by hand. That was the single most common failure in the
 * whole flow, and a mismatch only surfaced as dead colour buttons on the live
 * page — after a ~350 MB re-upload.
 *
 * Now it is the other way round: CLO names whatever it likes, the shrink robot
 * reports the names it found (in file order) onto the product as `fileColours`,
 * and this dropdown lets the owner point each CMS colour at one of them. The
 * chosen string is stored verbatim as `variantId` and handed to <model-viewer>
 * as its `variantName`, so nothing ever has to be renamed.
 *
 * WHAT THE SWATCH IS FOR. Mapping "Colorway 2" to a colour row was still a blind
 * guess, and on 2026-08-03 the live site was serving a maroon garment labelled
 * "Navy", a blush one labelled "Black" and a powder blue one labelled "Crimson" —
 * every published name wrong, with two colourways in the same file never mapped
 * at all. The robot now reads the real colour out of each variant, so the option
 * says what it actually is. You cannot pick "Colorway 2" for a row called Navy
 * while a maroon dot sits next to it.
 *
 * Suggestion only. Nothing here writes a name, a slug or a row — a colourway
 * slug is printed on physical QR tags and no automated process may touch one.
 */

interface FileColourDetail {
  variantId: string
  hex: string
  name: string
  confidence: 'high' | 'low'
}

const isDetail = (value: unknown): value is FileColourDetail =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as FileColourDetail).variantId === 'string' &&
  typeof (value as FileColourDetail).hex === 'string' &&
  typeof (value as FileColourDetail).name === 'string'

export const SourceVariantSelect: TextFieldClientComponent = ({ field, path }) => {
  const { setValue, showError, value } = useField<string>({ path })

  // `fileColours` lives at the top level of the product form, written by the
  // shrink robot. Reading it through useFormFields means the dropdown fills in
  // as soon as the document is reloaded after processing — no config change.
  const fileColours = useFormFields(([fields]) => {
    const raw = fields?.fileColours?.value
    if (Array.isArray(raw)) return raw.filter((entry): entry is string => typeof entry === 'string')
    return []
  })

  // Enrichment, not a replacement. A product last processed by a container built
  // before variant colours existed has `fileColours` and no details, and must
  // keep working exactly as before — so every use below is guarded.
  const details = useFormFields(([fields]) => {
    const raw = fields?.fileColourDetails?.value
    return Array.isArray(raw) ? raw.filter(isDetail) : []
  })

  const label = field?.label
  const description = field?.admin?.description
  const detailFor = (name: string) => details.find((d) => d.variantId === name)

  if (fileColours.length === 0) {
    return (
      <div className="field-type">
        <FieldLabel label={label} path={path} />
        <input
          disabled
          readOnly
          value={value ?? ''}
          placeholder="Upload your CLO file on the “3D file” tab first"
        />
        <div className="field-description">
          {typeof description === 'string'
            ? description
            : 'Once your CLO file has been read, this list fills with the colours found inside it.'}
        </div>
      </div>
    )
  }

  // A value saved earlier that is no longer in the file (the owner re-exported
  // with different colours) must stay visible and selected — otherwise the
  // dropdown would silently blank a stored mapping.
  const optionLabel = (name: string) => {
    const detail = detailFor(name)
    if (!detail) return name
    return detail.confidence === 'high'
      ? `${name} — looks like ${detail.name} (${detail.hex})`
      : `${name} — closest match ${detail.name} (${detail.hex}), not confident`
  }
  const options = fileColours.map((name) => ({ label: optionLabel(name), value: name }))
  if (value && !fileColours.includes(value)) {
    options.push({ label: `${value} — not in the current file`, value })
  }

  const selected = value ? detailFor(value) : undefined

  return (
    <div className="field-type">
      <SelectInput
        description={typeof description === 'string' ? description : undefined}
        label={label}
        name="variantId"
        onChange={(option) => {
          const next = Array.isArray(option) ? option[0] : option
          setValue((next as { value?: string } | null)?.value ?? '')
        }}
        options={options}
        path={path}
        showError={showError}
        value={value ?? ''}
      />
      {selected && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}
          // The swatch is the whole point of this component, so it is announced
          // rather than left as decoration for anyone not looking at colour.
          role="note"
          aria-label={`Selected file colour is ${selected.name}, ${selected.hex}`}
        >
          <span
            aria-hidden="true"
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: selected.hex,
              border: '1px solid rgba(128,128,128,0.5)',
              flex: '0 0 auto',
            }}
          />
          <small>
            This is the colour inside your file: <strong>{selected.name}</strong> ({selected.hex}).
            {selected.confidence === 'low' &&
              ' We are not confident about the name — trust the swatch.'}
          </small>
        </div>
      )}
    </div>
  )
}
