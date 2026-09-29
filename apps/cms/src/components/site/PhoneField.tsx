'use client'

import { useRef } from 'react'
import { type DialState, editDialCode, nextDialCode } from '../../lib/dialCode'
import { COUNTRIES } from '../../lib/dialCodes'
import { MAX_LENGTHS } from '../../lib/inquiry'

/**
 * The contact form's country, country code and phone number (owner, 2026-09-29: "phone with the
 * code filled in automatically, and editable").
 *
 * ⚠️ WITHOUT SCRIPTING IT IS THREE PLAIN FIELDS, AND THAT IS THE WHOLE FORM STILL WORKING. The
 * buyer picks a country and types the code themselves; the route joins code and number
 * (`joinPhone` in lib/inquiry.ts). The script only saves them the typing.
 *
 * ⚠️ THE CODE FIELD IS UNCONTROLLED, ON PURPOSE. A React-controlled value would reset to its
 * initial "" when the page hydrates, wiping a code a quick buyer typed before the script
 * arrived. The rule for who wins — the country, or what the buyer typed — is `nextDialCode`,
 * which is unit-tested; this component only applies it.
 */
export function PhoneField() {
  const code = useRef<HTMLInputElement>(null)
  const dial = useRef<DialState>({ dial: '', edited: false })

  const onCountry = (name: string) => {
    const country = COUNTRIES.find((entry) => entry.name === name)
    const next = nextDialCode(dial.current, country?.code ?? '')
    dial.current = next
    if (!next.edited && code.current) code.current.value = next.dial ? `+${next.dial}` : ''
  }

  return (
    <>
      <label className="inquiry-form__field">
        <span className="inquiry-form__label">Country (optional)</span>
        <select
          className="inquiry-form__input inquiry-form__select"
          name="country"
          autoComplete="country-name"
          defaultValue=""
          onChange={(event) => onCountry(event.currentTarget.value)}
        >
          <option value="">Choose a country (optional)</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.name}>
              {country.name}
            </option>
          ))}
        </select>
      </label>

      <div className="inquiry-form__phone">
        <label className="inquiry-form__field">
          <span className="inquiry-form__label">Country code</span>
          <input
            ref={code}
            className="inquiry-form__input"
            type="text"
            name="phoneCode"
            inputMode="tel"
            autoComplete="tel-country-code"
            maxLength={5}
            onInput={(event) => {
              dial.current = editDialCode(event.currentTarget.value)
            }}
          />
        </label>
        <label className="inquiry-form__field">
          <span className="inquiry-form__label">Phone (optional)</span>
          <input
            className="inquiry-form__input"
            type="tel"
            name="phone"
            autoComplete="tel-national"
            maxLength={MAX_LENGTHS.phone}
          />
        </label>
      </div>
    </>
  )
}
