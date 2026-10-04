import type { ViewerApiSuccess } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * How "More from this category" behaves while its cards' file is on its way, and when it never
 * comes (polish S6). The file is fetched as the page's script starts (`RelatedGarments.tsx` says
 * why), so each test loads a FRESH copy of the section's module, with the cards' module held back
 * or failing, to put the page in the state it describes.
 *
 * What would have to break for these to fail: the section waiting for its cards (the reveal then
 * never finds it, and it stays invisible: the viewer-layout rule's `data-reveal` trap), late cards
 * drawn outside the section the reveal is watching, or a lost file taking the whole page to its
 * error screen, or going unreported.
 */

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.resetModules()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.doUnmock('./RelatedCards')
})

const DATA = {
  product: { category: 'Outerwear' },
  related: [
    { slug: 'r1', colourSlug: 'wine', productName: 'Shell', productCode: 'R1', imageUrl: null },
  ],
} as unknown as ViewerApiSuccess

/** Lets pending imports settle and their state land. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

/** Steps until `done` holds, letting React apply what arrived after each step (2 s at most). */
async function until(done: () => boolean) {
  for (let step = 0; step < 200 && !done(); step++) await settle()
}

describe('RelatedGarments while its cards load', () => {
  it('draws the section at once, and the late cards into that same section', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.doMock('./RelatedCards', async () => {
      await held
      return vi.importActual('./RelatedCards')
    })
    const { RelatedGarments } = await import('./RelatedGarments')
    act(() => root.render(<RelatedGarments data={DATA} />))
    const section = host.querySelector('section')
    expect(section?.hasAttribute('data-reveal')).toBe(true)
    expect(host.querySelectorAll('.related__card')).toHaveLength(0)

    // Still none after a while: the file is held, and the section does not wait for it.
    await settle()
    expect(host.querySelectorAll('.related__card')).toHaveLength(0)

    release()
    await until(() => host.querySelector('.related__card') !== null)
    expect(host.querySelector('section')).toBe(section)
    expect(section?.querySelectorAll('.related__card')).toHaveLength(1)
  })

  it('keeps the section without cards when their file cannot be fetched, and reports it', async () => {
    vi.doMock('./RelatedCards', () => {
      throw new Error('Failed to fetch dynamically imported module')
    })
    const reports: string[] = []
    const listen = (event: Event) =>
      reports.push((event as CustomEvent<{ kind: string }>).detail.kind)
    document.addEventListener('run:diagnostic', listen)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { RelatedGarments } = await import('./RelatedGarments')
      act(() => root.render(<RelatedGarments data={DATA} />))
      await until(() => reports.length > 0)
      expect(host.querySelector('h2')?.textContent).toBe('More Outerwear in 3D.')
      expect(host.querySelector('.related__all')?.textContent).toBe('See all outerwear in 3D')
      expect(host.querySelectorAll('.related__card')).toHaveLength(0)
      expect(reports).toEqual(['related-cards-failed'])
    } finally {
      document.removeEventListener('run:diagnostic', listen)
      warn.mockRestore()
    }
  })
})
