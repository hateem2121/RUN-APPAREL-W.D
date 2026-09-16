import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * RO-06. Measured live 2026-09-16: with scripts off, every 3D page was a blank white page,
 * with no company name and no way to make contact. The body held only `<div id="root">`.
 * Owner's wording, 2026-09-16.
 */
const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8')
const block = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? ''
const text = block
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim()

describe('the page with JavaScript off (RO-06)', () => {
  it('says what the page is and how to reach the company', () => {
    expect(text).toBe(
      'This 3D garment reference needs JavaScript. Turn it on to see the garment, or contact RUN APPAREL at wear-run.help/contact.',
    )
  })

  it('links the contact page', () => {
    expect(block).toContain('<a href="https://wear-run.help/contact">wear-run.help/contact</a>')
  })

  it('sits in the body, before the app root', () => {
    const noscript = html.indexOf('<noscript>')
    expect(noscript).toBeGreaterThan(html.indexOf('<body'))
    expect(noscript).toBeLessThan(html.indexOf('<div id="root">'))
  })
})
