import { describe, expect, it } from 'vitest'
import { type ClickWindow, contactMethod, watchContactClicks } from './contactClicks.ts'

const INQUIRY = 'inquiry@wear-run.com'

describe('which links are a buyer reaching out', () => {
  it.each([
    ['https://wa.me/923361777313', 'whatsapp'],
    ['https://wa.me/923361777313?text=Hello%20there', 'whatsapp'],
    ['tel:+923361777313', 'phone'],
    ['TEL:+92 336 1777313', 'phone'],
    ['mailto:inquiry@wear-run.com', 'email'],
    ['mailto:inquiry@wear-run.com?subject=A%20garment', 'email'],
    ['mailto:Inquiry@Wear-Run.com', 'email'],
  ])('%s is %s', (href, method) => {
    expect(contactMethod(href, INQUIRY)).toBe(method)
  })

  it.each([
    // The other two mailboxes on the site are not buyers' inquiries.
    'mailto:hr@wear-run.com',
    'mailto:press@wear-run.com',
    // A look-alike host must not pass for WhatsApp.
    'https://wa.me.evil.example/923361777313',
    'https://notwa.me/923361777313',
    'https://example.com/contact',
    '/contact',
    '#inquiry',
    'javascript:void(0)',
    '',
  ])('%s is not counted', (href) => {
    expect(contactMethod(href, INQUIRY)).toBeNull()
  })

  it('counts the mailbox the site settings name, not a fixed one', () => {
    expect(contactMethod('mailto:hello@example.com', 'hello@example.com')).toBe('email')
    expect(contactMethod('mailto:inquiry@wear-run.com', 'hello@example.com')).toBeNull()
  })
})

/** A page with a click listener and a way to click an element on it. */
function fakePage(options: { started: boolean }) {
  type Listener = (event: { target: unknown }) => void
  const listeners = new Set<Listener>()
  const win = {
    dataLayer: [] as unknown[],
    runTrackersStarted: options.started,
    document: {
      createElement: () => ({ src: '', async: false, onload: null }),
      head: { appendChild: (node: unknown) => node },
      addEventListener: (_type: 'click', fn: Listener) => listeners.add(fn),
      removeEventListener: (_type: 'click', fn: Listener) => listeners.delete(fn),
    },
  } as unknown as ClickWindow
  const anchor = (href: string | null) => ({
    closest: (selector: string) =>
      selector === 'a[href]' && href !== null ? { getAttribute: () => href } : null,
  })
  const click = (target: unknown) => {
    for (const fn of [...listeners]) fn({ target })
  }
  const events = () =>
    (win.dataLayer as ArrayLike<unknown>[])
      .map((entry) => Array.from(entry))
      .filter((args) => args[0] === 'event')
  return { win, anchor, click, events, listeners }
}

describe('telling Google Analytics about a tap', () => {
  it('queues one `contact_click` with only the method, for a visitor who accepted', () => {
    const page = fakePage({ started: true })
    watchContactClicks(page.win, INQUIRY)
    page.click(page.anchor('https://wa.me/923361777313'))
    page.click(page.anchor('tel:+923361777313'))
    page.click(page.anchor('mailto:inquiry@wear-run.com?subject=x'))
    expect(page.events()).toEqual([
      ['event', 'contact_click', { method: 'whatsapp' }],
      ['event', 'contact_click', { method: 'phone' }],
      ['event', 'contact_click', { method: 'email' }],
    ])
  })

  it('never puts the number or the address in the event', () => {
    const page = fakePage({ started: true })
    watchContactClicks(page.win, INQUIRY)
    page.click(page.anchor('https://wa.me/923361777313'))
    page.click(page.anchor('mailto:inquiry@wear-run.com'))
    const sent = JSON.stringify(page.events())
    expect(sent).not.toContain('923361777313')
    expect(sent).not.toContain('wear-run.com')
  })

  it('queues nothing for a visitor who has not accepted', () => {
    const page = fakePage({ started: false })
    watchContactClicks(page.win, INQUIRY)
    page.click(page.anchor('https://wa.me/923361777313'))
    expect(page.events()).toEqual([])
  })

  it('starts counting when the visitor accepts later on the same page', () => {
    const page = fakePage({ started: false })
    watchContactClicks(page.win, INQUIRY)
    page.click(page.anchor('tel:+923361777313'))
    page.win.runTrackersStarted = true
    page.click(page.anchor('tel:+923361777313'))
    expect(page.events()).toEqual([['event', 'contact_click', { method: 'phone' }]])
  })

  it('ignores a tap on anything that is not a counted link', () => {
    const page = fakePage({ started: true })
    watchContactClicks(page.win, INQUIRY)
    page.click(page.anchor(null))
    page.click(page.anchor('mailto:hr@wear-run.com'))
    page.click(page.anchor('/products'))
    page.click(null)
    page.click({})
    expect(page.events()).toEqual([])
  })

  it('stops listening when told to', () => {
    const page = fakePage({ started: true })
    const stop = watchContactClicks(page.win, INQUIRY)
    expect(page.listeners.size).toBe(1)
    stop()
    expect(page.listeners.size).toBe(0)
    page.click(page.anchor('tel:+923361777313'))
    expect(page.events()).toEqual([])
  })
})
