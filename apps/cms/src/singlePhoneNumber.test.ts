import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { trackedFiles } from '../../../scripts/quoted-settings.mjs'

/**
 * RUN APPAREL has ONE phone number, +92 336 1777313, for calls and WhatsApp alike (owner,
 * 2026-10-26: "Through out the website and all different directories, want to only have a
 * single number"). A second line, +92 305 6161313, sat on /contact and in the structured data
 * from 2026-10-08 until that day, as a constant in `lib/companyFacts.ts`, out of reach of the
 * CMS field that holds the real number. This scans every tracked file for a Pakistani mobile
 * number in any of the ways one is written (+92 336 1777313, +923361777313, 0336-1777313,
 * 92-336-177-7313) and fails on any number but the company's and the test placeholder.
 */
const COMPANY = '923361777313'
/** The `+92 300 1234567` placeholder the form tests type into the phone field. */
const PLACEHOLDER = '923001234567'

/*
 * A word boundary on both sides, so a number inside a longer run of digits or hex (a SHA-256,
 * the Google Maps `cid=4820576127932193003` in the footer) is not read as a phone number. A
 * leading 0 straight before a decimal point is a fraction, never a trunk prefix: OKLab's
 * `0.3963377774` in `packages/shared/src/dye.ts` was read as 0396 3377774 (2026-10-26).
 */
const PK_MOBILE = /(?<![\w+.])(?:\+?92|0(?!\.\d))[\s().-]*3\d{2}(?:[\s().-]*\d){7}(?!\d)/g

/** Every Pakistani mobile number in `text` other than the two allowed, as 92XXXXXXXXXX. */
function otherNumbers(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(PK_MOBILE)) {
    const digits = match[0].replace(/\D/g, '').replace(/^0/, '92')
    if (digits !== COMPANY && digits !== PLACEHOLDER) found.push(digits)
  }
  return found
}

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const BINARY = /\.(glb|gltf|bin|png|jpe?g|webp|avif|gif|ico|ktx2|woff2?|ttf|otf|pdf|gz|zip|wasm)$/i
/** This file names the removed number on purpose, in its negative control. */
const SELF = 'apps/cms/src/singlePhoneNumber.test.ts'

describe('the company has a single phone number', () => {
  it('sees the removed second number in every way it was written (negative control)', () => {
    expect(otherNumbers('Call +92 305 6161313')).toEqual(['923056161313'])
    expect(otherNumbers('tel:+923056161313')).toEqual(['923056161313'])
    expect(otherNumbers('0305-6161313 or (0305) 616 1313')).toEqual([
      '923056161313',
      '923056161313',
    ])
    expect(otherNumbers('+92-305-616-1313')).toEqual(['923056161313'])
  })

  it('lets the company number and the test placeholder through, in any format', () => {
    expect(
      otherNumbers(
        '+92 336 1777313 +923361777313 +92-336-1777313 0336 1777313 wa.me/923361777313 +92 300 1234567',
      ),
    ).toEqual([])
  })

  it('does not read a number out of a longer run of digits or hex', () => {
    expect(otherNumbers('maps?cid=4820576127932193003')).toEqual([])
    expect(
      otherNumbers('551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'),
    ).toEqual([])
  })

  it('does not read a number out of a decimal fraction', () => {
    // OKLab's matrices in packages/shared/src/dye.ts (Ottosson, 2020): "0." and ten digits from 3.
    expect(otherNumbers('(L + 0.3963377774 * A + 0.2158037573 * B)')).toEqual([])
    expect(otherNumbers('- 0.3413193965 * s2')).toEqual([])
  })

  it('finds no other number anywhere in the repository', () => {
    const files = trackedFiles(ROOT).filter((file) => !BINARY.test(file) && file !== SELF)
    // A scan that read nothing would pass; the repo has well over a thousand text files.
    expect(files.length).toBeGreaterThan(1000)
    const hits: string[] = []
    for (const file of files) {
      let text = ''
      try {
        text = readFileSync(join(ROOT, file), 'utf8')
      } catch {
        continue // a symlink to a folder, or a file deleted but not yet committed
      }
      for (const number of otherNumbers(text)) hits.push(`${file}: +${number}`)
    }
    expect(hits).toEqual([])
  })
})
