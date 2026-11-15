import { describe, expect, it } from 'vitest'
import { localHref } from './localHref'

describe('localHref (Russian section, 2026-11-15)', () => {
  it('leaves every link on an English page exactly as it is', () => {
    for (const href of ['/', '/contact', '/guides/aql-inspection', '/products?family=x', '#top']) {
      expect(localHref(href, '/custom-teamwear-manufacturer')).toBe(href)
    }
    expect(localHref('/contact', '/rugby')).toBe('/contact')
  })

  it('sends a Russian page’s internal links to their twins, keeping query and fragment', () => {
    const here = '/ru/guides/aql-inspection'
    expect(localHref('/', here)).toBe('/ru')
    expect(localHref('/custom-teamwear-manufacturer', here)).toBe(
      '/ru/custom-teamwear-manufacturer',
    )
    expect(localHref('/products?family=teamwear-uniforms', here)).toBe(
      '/ru/products?family=teamwear-uniforms',
    )
    expect(localHref('/privacy#cookies', '/ru')).toBe('/ru/privacy#cookies')
    expect(localHref('/faq/orders-and-samples#moq', here)).toBe('/ru/faq/orders-and-samples#moq')
  })

  it('leaves what has no Russian twin, or is not a page, alone', () => {
    const here = '/ru/contact'
    expect(localHref('/products/rxps/wine', here)).toBe('/products/rxps/wine')
    expect(localHref('/journal/a-post', here)).toBe('/journal/a-post')
    expect(localHref('/ru/contact', here)).toBe('/ru/contact')
    expect(localHref('https://example.com/contact', here)).toBe('https://example.com/contact')
    expect(localHref('//example.com/x', here)).toBe('//example.com/x')
    expect(localHref('mailto:inquiry@wear-run.com', here)).toBe('mailto:inquiry@wear-run.com')
    expect(localHref('/api/media/x', here)).toBe('/api/media/x')
    expect(localHref('/admin', here)).toBe('/admin')
    expect(localHref('/guides/buyer-questions.csv', here)).toBe('/guides/buyer-questions.csv')
    expect(localHref('#section', here)).toBe('#section')
  })
})
