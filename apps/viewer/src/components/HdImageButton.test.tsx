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
    // A no-break space: the two words never split across lines inside the pill.
    expect(button?.textContent?.replace(/\u00a0/g, ' ')).toContain('HD IMAGE')
    expect(button?.getAttribute('aria-label')).toBe(
      'HD image: studio render of Velocity Performance Tee in Wine',
    )
    expect(button?.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button?.disabled).toBe(false)
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
