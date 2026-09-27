import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SiteError from './error'

describe('the branded crash page', () => {
  const html = renderToStaticMarkup(
    createElement(SiteError, { error: new Error('boom'), reset: () => {} }),
  )

  it('has one heading, a retry button and the address, and never the error text', () => {
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('Try again</button>')
    expect(html).toContain(`mailto:${DEFAULT_SITE_SETTINGS.email}`)
    // A stack trace or message on a public page is a leak (L1 §1 "verbose errors").
    expect(html).not.toContain('boom')
  })
})
