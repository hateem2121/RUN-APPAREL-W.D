import { describe, expect, it } from 'vitest'
import { headProblems, payloadCopyProblems, readHead } from '../../../scripts/live-copy.mjs'

const SHELL = {
  title: 'RUN APPAREL — 3D Product Reference',
  description: 'RUN APPAREL — interactive 3D product reference for B2B partners.',
}

describe('readHead', () => {
  it('reads a description tag spread over several lines, as index.html writes it', () => {
    const html =
      '<title>R-XPS Wine</title>\n<meta\n      name="description"\n      content="Wine colorway." />'
    expect(readHead(html)).toEqual({ title: 'R-XPS Wine', description: 'Wine colorway.' })
  })

  it('returns empty strings, never undefined, when a tag is missing', () => {
    expect(readHead('<html></html>')).toEqual({ title: '', description: '' })
  })
})

describe('headProblems — each of the 80 pages must describe itself (CT-09, CT-10)', () => {
  const page = (url: string, title: string, description: string) => ({ url, title, description })

  it('accepts pages that all differ', () => {
    expect(
      headProblems([page('/a/1', 'A 1', 'A in one'), page('/a/2', 'A 2', 'A in two')], SHELL),
    ).toEqual([])
  })

  it('names a duplicate, an empty value and the generic shell — negative controls', () => {
    const problems = headProblems(
      [
        page('/a/1', 'A 1', 'Same text'),
        page('/a/2', 'A 2', 'Same text'),
        page('/a/3', '', 'Three'),
        page('/a/4', SHELL.title, 'Four'),
      ],
      SHELL,
    )
    expect(problems).toEqual([
      '/a/2: same description as /a/1',
      '/a/3: empty title',
      "/a/4: title is the generic shell's",
    ])
  })
})

describe('payloadCopyProblems — the text the CMS serves for a garment', () => {
  const payload = (product: Record<string, unknown>) => ({
    product: { productName: 'Tee', shortDescription: 'A tee.', ...product },
    colourways: [{ displayName: 'Wine', altText: 'Tee in Wine' }],
  })

  it('passes clean American copy, and lets a garment say "seamless"', () => {
    expect(
      payloadCopyProblems('t', payload({ garmentFit: 'Seamless knit, streamlined fit' })),
    ).toEqual([])
  })

  it('names each rule broken, with the field — negative controls', () => {
    expect(
      payloadCopyProblems(
        't',
        payload({
          retiredMessage: 'The colourway is gone 🔥',
          customisationSteps: [{ title: 'TODO', body: 'A world-class color.' }],
        }),
      ),
    ).toEqual([
      't retiredMessage: British spelling "colourway"',
      't retiredMessage: emoji 🔥',
      't customisationSteps[0].title: placeholder "TODO"',
      't customisationSteps[0].body: buzzword "world-class"',
    ])
  })

  it('reports a payload with no text at all instead of passing it', () => {
    expect(payloadCopyProblems('t', {})).toEqual(['t: the payload had no text at all'])
  })
})
