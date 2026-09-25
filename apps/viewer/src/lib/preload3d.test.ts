import { afterEach, describe, expect, it } from 'vitest'
import { PRELOADS_3D, preload3DAssets } from './preload3d'

describe('preload3DAssets (RO-08)', () => {
  afterEach(() => {
    for (const link of document.head.querySelectorAll('link[rel="preload"]')) link.remove()
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined })
  })

  it('asks for the decoder as a script and the lighting map as a CORS fetch', () => {
    expect(preload3DAssets()).toEqual(PRELOADS_3D.map((file) => file.href))
    const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')]
    expect(links.map((l) => [l.getAttribute('href'), l.as, l.crossOrigin])).toEqual([
      ['/meshopt_decoder.js', 'script', null],
      ['/env/studio-soft.hdr', 'fetch', 'anonymous'],
    ])
  })

  it('asks for nothing under Save-Data, where no 3D is drawn', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    })
    expect(preload3DAssets()).toEqual([])
    expect(document.head.querySelectorAll('link[rel="preload"]')).toHaveLength(0)
  })
})
