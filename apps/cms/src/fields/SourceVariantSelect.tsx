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
 * Before a file has been processed there is nothing to choose from, so the input
 * is disabled and says so rather than presenting an empty dropdown.
 */
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

  const label = field?.label
  const description = field?.admin?.description

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
  const options = fileColours.map((name) => ({ label: name, value: name }))
  if (value && !fileColours.includes(value)) {
    options.push({ label: `${value} — not in the current file`, value })
  }

  return (
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
  )
}
