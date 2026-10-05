import { COUNTRIES, type Country } from './dialCodes'

/**
 * The phone field's country code: filled from the chosen country, and editable (owner,
 * 2026-09-29). Pure, so the one rule that matters is a unit test rather than a feeling.
 *
 * ⚠️ AN EDIT WINS OVER THE COUNTRY, UNTIL THE BUYER CLEARS IT. A buyer in Dubai ordering for a
 * team in Canada may choose "Canada" and still want their own +971; if changing the country
 * then overwrote the code they typed, the form would be quietly correcting them. Clearing the
 * code field hands it back to the country, so there is always a way back to automatic.
 */
export type DialState = { dial: string; edited: boolean }

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]))

export function countryByCode(code: string): Country | undefined {
  return BY_CODE.get(code.trim().toUpperCase())
}

const BY_NAME = new Map(COUNTRIES.map((country) => [country.name.toLowerCase(), country]))

/**
 * The country as the buyer typed it (polish D7: a box that suggests as you type, where a list
 * was). Only a whole name counts, in any case: a half-typed "Paki" must not fill a code.
 */
export function countryByName(name: string): Country | undefined {
  return BY_NAME.get(name.trim().toLowerCase())
}

/** The country changed. An unknown or empty country leaves nothing to fill in. */
export function nextDialCode(previous: DialState, countryCode: string): DialState {
  if (previous.edited) return previous
  return { dial: countryByCode(countryCode)?.dial ?? '', edited: false }
}

/** The buyer typed in the code field. An empty field is automatic again. */
export function editDialCode(value: string): DialState {
  return { dial: value, edited: value.trim() !== '' }
}
