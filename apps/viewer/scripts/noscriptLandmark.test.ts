import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * VA-56 (visual audit, 2026-10-02). With JavaScript off, a garment page said "PREPARING…" for
 * ever: the no-JavaScript message (RO-06) was covered by the loading screen the HTML draws for
 * itself (RO-08), and an accessibility scan also found the message outside any landmark. The
 * loading screen is hidden when scripting is off (`@media (scripting: none)`, checked in
 * `src/styles/visualAuditCss.test.ts`), and the message now sits in a `<main>`.
 *
 * `noscript.test.ts` holds the message's words and its place before the app root; this file holds
 * the landmark. The reading of "is the message on screen" is `e2e/noscript-message.spec.ts`.
 */
const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8')
const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? ''

describe('the page with JavaScript off, as a landmark (VA-56)', () => {
  it('puts the message inside a <main>', () => {
    expect(
      /^\s*<main>[\s\S]*<\/main>\s*$/.test(noscript),
      'the no-JavaScript message is not wrapped in a <main>: a scan finds it outside any landmark',
    ).toBe(true)
    expect(noscript).toContain('This 3D garment reference needs JavaScript.')
  })

  it('has exactly one <main> in the file, so a visitor with scripts on never gets two', () => {
    // <noscript> content is parsed as markup only when scripting is off. With scripts on, the app
    // draws its own <main id="main-content">, and a second one here would be a second landmark.
    expect(html.match(/<main[\s>]/g) ?? []).toHaveLength(1)
  })

  it('leaves the loading screen outside the no-JavaScript block, where the stylesheet can hide it', () => {
    expect(noscript).not.toContain('preloader')
    expect(html).toContain('<div id="root"><div class="preloader">')
  })
})
