import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Preloader } from './Preloader'

/**
 * RO-08 — index.html carries a copy of the loading screen so a slow connection paints it
 * before React has downloaded (6.9 s median on slow 3G without it, measured 2026-09-25).
 * A copy can drift from the component it copies, and a drifted copy would show one screen
 * for the first seconds and swap to another. This renders the real component and requires
 * the HTML's copy to be exactly that markup.
 */
describe('the loading screen drawn from index.html is exactly <Preloader>', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('matches the component, element for element', () => {
    // The copy is the full-motion screen: page.css hides its sweep under reduced motion,
    // where the component leaves the element out.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    const html = readFileSync(join(__dirname, '../../index.html'), 'utf8')
    const copy = /<div id="root">([\s\S]*?)<\/div>\n/.exec(html)?.[1]
    expect(copy, 'index.html has no loading screen inside #root').toBeTruthy()
    const rendered = renderToStaticMarkup(<Preloader done={false} onExited={() => {}} />)
    expect(copy).toBe(rendered)
  })
})
