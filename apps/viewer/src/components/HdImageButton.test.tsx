import type { ViewerColourway } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HdImageButton } from './HdImageButton'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The HD IMAGE button's two promises (2026-09-27): it exists only where a render
 * exists, and it downloads nothing until the visitor shows intent. Both are about a
 * QR scan on mobile data — a picture offered and missing is a broken promise, and a
 * picture fetched for every scan spends a buyer's data on something most never open.
 */

const RENDER = {
  url: 'https://media.example/r-xx-wine-render.webp',
  alt: 'Tee in Wine, studio render',
  width: 1816,
  height: 2751,
  mimeType: 'image/webp',
}

const colourway = (slug: string, withRender: boolean): ViewerColourway =>
  ({
    variantId: slug.toUpperCase(),
    displayName: slug[0]?.toUpperCase() + slug.slice(1),
    slug,
    sequence: 1,
    poster: null,
    render: withRender ? { ...RENDER, url: RENDER.url.replace('wine', slug) } : null,
    glbUrl: null,
    isDefault: false,
    altText: slug,
    hexSwatch: null,
  }) as ViewerColourway

let host: HTMLDivElement
let root: Root
const created: string[] = []

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  created.length = 0
  // Count every image the component asks the browser for.
  vi.stubGlobal(
    'Image',
    class {
      decoding = ''
      set src(value: string) {
        created.push(value)
      }
    },
  )
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const mount = (selected: ViewerColourway) =>
  act(() =>
    root.render(
      <HdImageButton
        productName="Velocity Performance Tee"
        colourways={[colourway('wine', true), colourway('butter', false)]}
        selected={selected}
      />,
    ),
  )

describe('HdImageButton', () => {
  it('is absent on a colour with no render', () => {
    mount(colourway('butter', false))
    expect(host.querySelector('button')).toBeNull()
  })

  it('is present on a colour with a render, named for what it opens', () => {
    mount(colourway('wine', true))
    const button = host.querySelector('button')
    // A plain space (VA-09): `white-space: nowrap` keeps the two words on one line, and a
    // no-break space made the visible label differ from the spoken name by one character.
    // This used to normalise \u00a0 to a space first, which is what hid it.
    expect(
      button?.textContent,
      'the label is not "HD" + a plain space + "IMAGE" (a no-break space looks identical)',
    ).toContain('HD IMAGE')
    expect(button?.getAttribute('aria-label')).toBe(
      'HD image: studio render of Velocity Performance Tee in Wine',
    )
    expect(button?.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button?.disabled).toBe(false)
  })

  /**
   * VA-09 (visual audit, 2026-10-02). Lighthouse's label-in-name check failed this button: the
   * words it shows were "HD" + a no-break space + "IMAGE", and the name it speaks starts
   * "HD image: studio render of …" with a plain space. The check compares the two strictly and
   * does not treat U+00A0 as a space, so this must not either — no normalising before comparing.
   * WCAG 2.5.3 (Label in Name): the name contains the text that is presented visually.
   */
  it('shows words that its spoken name starts with (label in name, VA-09)', () => {
    mount(colourway('wine', true))
    const button = host.querySelector('button')
    const name = button?.getAttribute('aria-label') ?? ''
    const full = button?.textContent ?? ''
    // Under 22rem wide page.css hides the second word, and only this first one is shown.
    const short = button?.querySelector('span')?.firstChild?.textContent ?? ''
    expect(short).toBe('HD')
    expect(full, 'a no-break space is back in the visible label').not.toContain(' ')
    for (const visible of [full, short]) {
      expect(
        name.toLowerCase().startsWith(visible.toLowerCase()),
        `the visible words "${visible}" are not the start of the name "${name}"`,
      ).toBe(true)
    }
  })

  it('requests no render before intent, and exactly one on pointer-down', async () => {
    mount(colourway('wine', true))
    expect(created).toEqual([])
    const button = host.querySelector('button') as HTMLButtonElement
    act(() => {
      button.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(created).toEqual([RENDER.url])
    // A second intent for the same picture is not a second download.
    act(() => {
      button.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      button.focus()
    })
    expect(created).toEqual([RENDER.url])
    // Pointer-down also STARTS loading the dialog's lazy chunk (and its stylesheet), and
    // nothing here waited for it. On main's run 36578451820 (2026-09-29) all 1,136 viewer
    // tests passed and `verify` still failed: three `EnvironmentTeardownError: Cannot load
    // '/src/styles/hd-image.css' … after the environment was torn down`, because the load
    // outlived this file on a slower runner. Awaiting the same import resolves once that
    // load has finished, so the file cannot end with it in flight.
    await import('./HdImageDialog')
  })
})

/**
 * Polish D9: with 3D on the page the button SWITCHES the 3D window to the picture and back,
 * and FULL SCREEN opens the full-screen view while the picture shows. The window draws the
 * screen-sized copy (F16), so intent on the switch fetches only that.
 */
describe('HdImageButton as the 3D window’s switch (D9)', () => {
  const SCREEN = { ...RENDER, url: 'https://media.example/r-xx-wine-render-screen.webp' }
  const wine = { ...colourway('wine', true), renderScreen: SCREEN } as ViewerColourway

  const mountSwitch = (shown: boolean, onShownChange = vi.fn()) => {
    act(() =>
      root.render(
        <HdImageButton
          productName="Velocity Performance Tee"
          colourways={[wine]}
          selected={wine}
          shown={shown}
          onShownChange={onShownChange}
        />,
      ),
    )
    return onShownChange
  }
  const buttons = () => [...host.querySelectorAll('button')]

  it('off: one button, "HD IMAGE", that switches the window to the picture', () => {
    const onShownChange = mountSwitch(false)
    expect(buttons()).toHaveLength(1)
    const button = buttons()[0]!
    expect(button.textContent).toBe('HD IMAGE')
    expect(button.getAttribute('aria-label')).toBe(
      'HD image: studio render of Velocity Performance Tee in Wine',
    )
    expect(button.getAttribute('aria-haspopup'), 'it opens no dialog now').toBeNull()
    act(() => button.click())
    expect(onShownChange).toHaveBeenCalledWith(true)
  })

  it('off: intent fetches the window’s screen-sized copy, never the full render', () => {
    mountSwitch(false)
    act(() => {
      buttons()[0]!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(created).toEqual([SCREEN.url])
  })

  it('on: FULL SCREEN, then VIEW IN 3D, each named for what it does', async () => {
    const onShownChange = mountSwitch(true)
    const [full, back] = buttons()
    expect(full?.textContent).toBe('FULL SCREEN')
    expect(full?.getAttribute('aria-label')).toBe(
      'Full screen: studio render of Velocity Performance Tee in Wine',
    )
    expect(full?.getAttribute('aria-haspopup')).toBe('dialog')
    expect(back?.textContent).toBe('VIEW IN 3D')
    expect(back?.getAttribute('aria-label')).toBe('View in 3D')
    // Label in name (WCAG 2.5.3, VA-09): the short forms shown below 22rem are in the names.
    expect(full?.getAttribute('aria-label')?.toLowerCase().startsWith('full')).toBe(true)
    expect(back?.getAttribute('aria-label')).toContain('3D')

    act(() => back!.click())
    expect(onShownChange).toHaveBeenCalledWith(false)

    // FULL SCREEN's intent fetches the full render, which only the full-screen view draws.
    act(() => {
      full!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(created).toContain(RENDER.url)
    await import('./HdImageDialog')
  })
})
