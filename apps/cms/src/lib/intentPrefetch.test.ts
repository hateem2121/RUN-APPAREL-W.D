import { describe, expect, it } from 'vitest'
import { intentPrefetchProp, shouldPrefetchOnIntent } from './intentPrefetch'

/**
 * When a website link fetches its whole page ahead (faster-taps spec, Part 2): only on intent
 * (hover, focus, touch), only to a page inside the website that Next draws, and never when the
 * browser asks to save data.
 */
const here = new URL('https://wear-run.com/faq')
const intent = (overrides: Partial<Parameters<typeof shouldPrefetchOnIntent>[0]> = {}) =>
  shouldPrefetchOnIntent({
    href: '/products',
    here,
    saveData: false,
    download: false,
    target: null,
    ...overrides,
  })

describe('shouldPrefetchOnIntent', () => {
  it('fetches another website page ahead', () => {
    expect(intent()).toBe(true)
    expect(intent({ href: 'https://wear-run.com/about', target: '_self' })).toBe(true)
  })

  it.each([
    ['another origin', { href: 'https://cms.wear-run.help/admin' }],
    ['a garment page, which the viewer Worker draws', { href: '/products/r-asb/petrol' }],
    ['a garment page with a query', { href: '/products/r-asb/petrol?x' }],
    ['a family page, which the viewer Worker draws too', { href: '/products/r-asb' }],
    ['Save-Data', { saveData: true }],
    ['a download', { download: true }],
    ['a new tab', { target: '_blank' }],
    ['the current page', { href: '/faq' }],
    ['the current page with only a fragment', { href: '/faq#shipping' }],
  ])('never for %s', (_name, overrides) => {
    expect(intent(overrides)).toBe(false)
  })
})

/**
 * The `prefetch` IntentLink hands `next/link` (review of 27 Oct): intent upgrades the default to a
 * whole-page fetch, and never overrides a link its author set to `prefetch={false}`.
 */
describe('intentPrefetchProp', () => {
  it('fetches the whole page once intent is shown', () => {
    expect(intentPrefetchProp(true, undefined)).toBe(true)
    expect(intentPrefetchProp(true, null)).toBe(true)
  })

  it("leaves Next's own default before intent", () => {
    expect(intentPrefetchProp(false, undefined)).toBeUndefined()
    expect(intentPrefetchProp(false, true)).toBe(true)
  })

  it('never prefetches a link set to prefetch={false}, intent or not', () => {
    expect(intentPrefetchProp(true, false)).toBe(false)
    expect(intentPrefetchProp(false, false)).toBe(false)
  })
})
