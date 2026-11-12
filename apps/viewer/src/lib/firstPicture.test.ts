import { afterEach, describe, expect, it, vi } from 'vitest'
import { posterPicture } from './garmentContour'
import { waitForFirstPicture } from './firstPicture'

afterEach(() => {
  vi.useRealTimers()
})

describe('the opening screen waits for the garment picture (12 Nov 2026, B2)', () => {
  it('settles at once with nothing to wait for when the garment has no picture', async () => {
    const load = vi.fn(() => Promise.resolve())
    await expect(waitForFirstPicture(null, 1500, load)).resolves.toBe('none')
    expect(load).not.toHaveBeenCalled()
  })

  it('settles when the picture has decoded', async () => {
    await expect(
      waitForFirstPicture({ src: 'https://m/x.webp' }, 1500, () => Promise.resolve()),
    ).resolves.toBe('decoded')
  })

  it('settles on a broken picture instead of waiting for it', async () => {
    await expect(
      waitForFirstPicture({ src: 'https://m/x.webp' }, 1500, () =>
        Promise.reject(new Error('404')),
      ),
    ).resolves.toBe('failed')
  })

  it('gives up after the longest wait, so a hanging picture never holds the page', async () => {
    vi.useFakeTimers()
    const result = waitForFirstPicture(
      { src: 'https://m/x.webp' },
      1500,
      () => new Promise(() => {}),
    )
    vi.advanceTimersByTime(1499)
    let settled = false
    void result.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    vi.advanceTimersByTime(1)
    await expect(result).resolves.toBe('timeout')
  })

  it('asks for the very address and mode the stage uses, so the picture downloads once', async () => {
    const fakeImage = { crossOrigin: '', src: '', decode: () => Promise.resolve() }
    vi.stubGlobal(
      'Image',
      vi.fn(function makeImage() {
        return fakeImage
      }),
    )
    const stage = posterPicture('https://media.wear-run.com/rxps-wine-poster.webp')
    await waitForFirstPicture(stage, 1500)
    expect(fakeImage.src).toBe(stage.src)
    expect(fakeImage.crossOrigin).toBe(stage.crossOrigin)
    vi.unstubAllGlobals()
  })

  it('leaves a plain picture plain, as the stage draws the HD copy without CORS', async () => {
    const fakeImage = { crossOrigin: '', src: '', decode: () => Promise.resolve() }
    vi.stubGlobal(
      'Image',
      vi.fn(function makeImage() {
        return fakeImage
      }),
    )
    await waitForFirstPicture({ src: 'https://media.wear-run.com/rxps-wine-screen.webp' }, 1500)
    expect(fakeImage.src).toBe('https://media.wear-run.com/rxps-wine-screen.webp')
    expect(fakeImage.crossOrigin).toBe('')
    vi.unstubAllGlobals()
  })
})
