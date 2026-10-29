import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { RecoverablePicture } from './RecoverablePicture'

it('tries one distinct small alternative, then removes the broken image and permits explicit retry', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const asset = (url: string) => ({
    url,
    mimeType: 'image/webp',
    alt: 'Jersey in blue',
    width: 100,
    height: 100,
  })
  act(() =>
    root.render(
      <RecoverablePicture
        pictures={[asset('/screen.webp'), asset('/poster.webp')]}
        description="Jersey"
        className="stage__picture"
      />,
    ),
  )
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/screen.webp')
  act(() => host.querySelector('img')?.dispatchEvent(new Event('error')))
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/poster.webp')
  act(() => host.querySelector('img')?.dispatchEvent(new Event('error')))
  expect(host.querySelector('img')).toBeNull()
  expect(host.querySelector('[role="status"]')?.textContent).toContain('could not load')
  act(() => host.querySelector('button')?.click())
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/screen.webp')
  act(() => root.unmount())
  host.remove()
})

describe('duplicate picture sources', () => {
  it('does not repeat the same failed URL automatically', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const asset = { url: '/same.webp', mimeType: 'image/webp', alt: '', width: 10, height: 10 }
    act(() =>
      root.render(
        <RecoverablePicture
          pictures={[asset, asset]}
          description="Jersey"
          className="stage__picture"
        />,
      ),
    )
    act(() => host.querySelector('img')?.dispatchEvent(new Event('error')))
    expect(host.querySelector('img')).toBeNull()
    act(() => root.unmount())
  })
})
