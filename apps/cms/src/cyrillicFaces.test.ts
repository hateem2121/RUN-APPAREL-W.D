import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Cyrillic companions (packages/ui/src/cyrillic.css) join the brand's families under their
 * own names, so each must carry EXACTLY the brand face's style, weight and stretch. Font
 * matching picks one set of those descriptors before it reads `unicode-range`; a companion
 * that differs is a set of its own, and a browser may choose it for every letter. On
 * 2026-11-16 Roboto Flex said `font-weight: 100 1000` beside Archivo's `100 900`, and Chromium
 * on Linux drew every Latin letter of an English garment page in the system font (CI's Docker
 * image, apps/viewer/e2e/consent.spec.ts; a Mac never showed it). What would fail this: a
 * companion's descriptor drifting from its brand face, or the brand face changing alone.
 */

const REPO = join(__dirname, '..', '..', '..')
const read = (...parts: string[]) => readFileSync(join(REPO, ...parts), 'utf8')

type Face = { family: string; style: string; weight: string; stretch: string; range: string }

function faces(css: string): Face[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body = '']) => {
    const get = (name: string, fallback: string) =>
      (body.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1] ?? fallback)
        .replace(/\s+/g, ' ')
        .trim()
    return {
      family: get('font-family', '').replace(/["']/g, ''),
      style: get('font-style', 'normal'),
      weight: get('font-weight', 'normal'),
      stretch: get('font-stretch', 'normal'),
      range: get('unicode-range', 'U+0-10FFFF'),
    }
  })
}

const descriptors = ({ style, weight, stretch }: Face) => ({ style, weight, stretch })

const brand = [
  ...faces(read('packages', 'ui', 'src', 'archivo.css')),
  ...faces(
    read('apps', 'viewer', 'node_modules', '@fontsource', 'instrument-serif', '400-italic.css'),
  ),
]
const companions = faces(read('packages', 'ui', 'src', 'cyrillic.css'))

describe('the Cyrillic companions match the brand faces they join', () => {
  it('declares one companion each for Archivo and the Instrument Serif italic', () => {
    expect(companions.map((face) => `${face.family} ${face.style}`).sort()).toEqual([
      'Archivo Variable normal',
      'Instrument Serif italic',
    ])
  })

  for (const companion of companions) {
    it(`${companion.family} (${companion.style}): the same style, weight and stretch`, () => {
      const own = brand.filter(
        (face) => face.family === companion.family && face.style === companion.style,
      )
      expect(own.length, 'no brand face of this family and style to join').toBeGreaterThan(0)
      for (const face of own) expect(descriptors(companion)).toEqual(descriptors(face))
    })
  }

  it('adds Cyrillic only: no companion claims a Latin letter', () => {
    for (const face of companions) {
      const starts = face.range.split(',').map((part) => Number.parseInt(part.trim().slice(2), 16))
      expect(starts.length).toBeGreaterThan(0)
      // U+0400 is the first Cyrillic letter; everything below it is Latin, Greek or punctuation.
      for (const start of starts) expect(start).toBeGreaterThanOrEqual(0x400)
    }
  })
})
