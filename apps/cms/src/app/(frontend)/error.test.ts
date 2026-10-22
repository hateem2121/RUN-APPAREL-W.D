import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import SiteError from './error'

/** The first <button> in an element tree, found without a DOM (SiteError uses no hooks). */
function findButton(node: ReactNode): ReactElement<{ onClick?: () => void }> | null {
  if (!isValidElement(node)) return null
  const element = node as ReactElement<{ onClick?: () => void; children?: ReactNode }>
  if (element.type === 'button') return element
  for (const child of Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children]) {
    const found = findButton(child as ReactNode)
    if (found) return found
  }
  return null
}

describe('the branded crash page', () => {
  const html = renderToStaticMarkup(
    createElement(SiteError, { error: new Error('boom'), retry: () => {} }),
  )

  it('has one heading, a retry button and the address, and never the error text', () => {
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('Try again</button>')
    expect(html).toContain(`mailto:${DEFAULT_SITE_SETTINGS.email}`)
    // A stack trace or message on a public page is a leak (L1 §1 "verbose errors").
    expect(html).not.toContain('boom')
  })

  // Found 2026-10-22: the button called `reset()`, which re-renders the boundary's children
  // WITHOUT re-fetching, so a page that failed on a fetch failed again on the same data. Next
  // 16.3.8's error.md says to use `retry()` (stable since v16.3.0) in most cases.
  it('"Try again" calls retry(), which re-fetches, and never reset()', () => {
    const retry = vi.fn()
    const reset = vi.fn()
    const tree = (SiteError as unknown as (props: object) => ReactNode)({
      error: new Error('boom'),
      retry,
      reset,
    })
    const button = findButton(tree)
    expect(button).not.toBeNull()
    button?.props.onClick?.()
    expect(retry).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })
})
