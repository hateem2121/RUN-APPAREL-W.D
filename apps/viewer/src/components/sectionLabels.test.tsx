import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ViewerApiSuccess } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CustomisationSection } from './CustomisationSection'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * VA-39 (visual audit, 2026-10-02): THE NUMBER IN A SECTION LABEL IS WRITTEN ONCE.
 *
 * The garment pages' two labels read "№02 — CUSTOMIZATION — №02" and "№03 — START THE
 * CONVERSATION — №03": the number at both ends, which reads as a typo. The website's labels
 * carry it once, in sentence case ("№02 — What we make"), and `.section-number`
 * (packages/ui/src/base.css, `text-transform: uppercase`) decides the capitals on screen. So a
 * label is checked here as SOURCE TEXT, which is what a screen reader reads (MDN, text-transform,
 * read 2026-10-02: the property changes the drawing, not the text).
 *
 * WHAT WOULD HAVE TO BREAK FOR THIS TO FAIL: someone pastes a label back with a second number
 * (the way the first two were written), or writes a new garment-page label in shouted capitals.
 * The e2e (`e2e/sectionLabels.spec.ts`) asks the rendered page the same question in a browser.
 */

const SRC = join(import.meta.dirname, '..')

/** `№02`, written either as the character or as the HTML entity the viewer's source uses. */
const NUMBER = /(?:&#8470;|№)\s*\d+/g

/** The label's words, after its leading number and the dash that follows it. */
const wordsOf = (label: string) => label.replace(/^(?:&#8470;|№)\s*\d+\s*—\s*/, '')

/** Every `.tsx` under `src/` that is not a test, found by walking, so a new file is covered too. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : []
  })
}

/** Each `<p className="section-number">…</p>` in the garment pages' source: file and label text. */
const LABELS = sourceFiles(SRC).flatMap((path) =>
  [...readFileSync(path, 'utf8').matchAll(/className="section-number">([^<]*)</g)].map((match) => ({
    file: path.slice(SRC.length + 1),
    label: (match[1] ?? '').trim(),
  })),
)

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the garment pages’ section labels (VA-39)', () => {
  it('the customisation label is "№02 — Customization", the number once', () => {
    const data = {
      product: { customisationIntroHtml: '', customisationSteps: [] },
    } as unknown as ViewerApiSuccess
    act(() => root.render(<CustomisationSection data={data} />))
    expect(host.querySelector('.section-number')?.textContent).toBe('№02 — Customization')
  })

  it('finds the labels it is meant to guard (a scan that finds none passes vacuously)', () => {
    const files = LABELS.map((entry) => entry.file).sort()
    expect(files).toEqual([
      'components/Contact.tsx',
      'components/CustomisationSection.tsx',
      'components/RelatedGarments.tsx',
    ])
  })

  for (const { file, label } of LABELS) {
    it(`${file}: "${label}" starts with its number and carries it once`, () => {
      expect(label).toMatch(/^(?:&#8470;|№)\s*\d{2} — \S/)
      expect(label.match(NUMBER)?.length, 'the number appears more than once').toBe(1)
    })

    it(`${file}: "${label}" is written in sentence case, as the website writes its source`, () => {
      const words = wordsOf(label)
      expect(words, 'the words are shouted in the source').not.toBe(words.toUpperCase())
    })
  }
})
