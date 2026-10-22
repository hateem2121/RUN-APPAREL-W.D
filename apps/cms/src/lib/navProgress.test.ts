import { describe, expect, it } from 'vitest'
import { arrived, type ClickLike, clientNavigationTarget } from './navProgress'

const here = new URL('https://wear-run.com/faq')
const click = (over: Partial<ClickLike> = {}): ClickLike => ({
  defaultPrevented: true,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  anchor: { href: 'https://wear-run.com/', target: '', hasDownload: false },
  ...over,
})

describe('clientNavigationTarget (which taps start the loading line)', () => {
  it('a link Next took over, to another page of the site, starts it', () => {
    expect(clientNavigationTarget(click(), here)?.pathname).toBe('/')
  })

  it('a link nobody prevented is the browser’s own load, which shows its own progress', () => {
    expect(clientNavigationTarget(click({ defaultPrevented: false }), here)).toBeNull()
  })

  it('a click outside any link starts nothing', () => {
    expect(clientNavigationTarget(click({ anchor: null }), here)).toBeNull()
  })

  it('a new tab, a download, another button or a modifier key starts nothing', () => {
    const anchor = { href: 'https://wear-run.com/', target: '', hasDownload: false }
    expect(
      clientNavigationTarget(click({ anchor: { ...anchor, target: '_blank' } }), here),
    ).toBeNull()
    expect(
      clientNavigationTarget(click({ anchor: { ...anchor, hasDownload: true } }), here),
    ).toBeNull()
    expect(clientNavigationTarget(click({ button: 1 }), here)).toBeNull()
    for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const)
      expect(clientNavigationTarget(click({ [key]: true }), here)).toBeNull()
  })

  it('another site, the same page or only its #fragment starts nothing', () => {
    const to = (href: string) =>
      clientNavigationTarget(click({ anchor: { href, target: '', hasDownload: false } }), here)
    expect(to('https://example.com/')).toBeNull()
    expect(to('https://wear-run.com/faq')).toBeNull()
    expect(to('https://wear-run.com/faq#shipping')).toBeNull()
  })

  it('a change of query alone is a navigation (the products filter)', () => {
    const anchor = { href: 'https://wear-run.com/faq?family=x', target: '', hasDownload: false }
    expect(clientNavigationTarget(click({ anchor }), here)?.search).toBe('?family=x')
  })

  it('an explicit _self target is the same tab', () => {
    const anchor = { href: 'https://wear-run.com/', target: '_self', hasDownload: false }
    expect(clientNavigationTarget(click({ anchor }), here)).not.toBeNull()
  })
})

describe('arrived', () => {
  it('counts path and query, not the fragment', () => {
    const to = new URL('https://wear-run.com/products?family=x')
    expect(arrived(to, new URL('https://wear-run.com/products?family=x#top'))).toBe(true)
    expect(arrived(to, new URL('https://wear-run.com/products'))).toBe(false)
    expect(arrived(to, new URL('https://wear-run.com/faq'))).toBe(false)
  })
})
