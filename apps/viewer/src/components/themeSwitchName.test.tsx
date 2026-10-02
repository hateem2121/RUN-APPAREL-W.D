import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { THEME_SWITCH_NAMES } from '@run-apparel/shared'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Header } from './Header'

/**
 * VA-38 (visual audit 2026-10-02) said the theme switch "names the wrong action before the script
 * runs: the server always writes 'Switch to dark mode'; the script corrects it about a second
 * later". What the server writes is BOTH names, one in each of two faces, and `notch.css` shows the
 * face for the page's theme (`data-theme`, else the system's), so the switch is named for the page
 * it is on from the first paint, with no script at all. This reads that name from the real markup
 * and the real rules, and holds it. (The website's `ThemeSwitch.tsx` writes the same two faces
 * under the same rules; `apps/cms/src/auditGuards.test.ts` keeps the markup in step, and
 * `apps/cms/e2e/themeSwitch.spec.ts` reads the name in three browsers with the site's scripts
 * refused, which covers the system-preference half this file cannot.)
 *
 * ⚠️ jsdom PARSES `notch.css` AS A WHOLE AND DROPPED IT (every face came back `inline`), so only the
 * rules about the faces that sit outside any `@media` are loaded, taken out of the shipped file by
 * brace-matching, never retyped here. The `@media (prefers-color-scheme)` pair is the system half and
 * is for the browser suite.
 */

const NOTCH = readFileSync(
  join(import.meta.dirname, '..', '..', '..', '..', 'packages', 'ui', 'src', 'notch.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

/** Every rule outside an at-rule, as text. */
function plainRules(source: string): string[] {
  const rules: string[] = []
  let pos = 0
  while (pos < source.length) {
    const open = source.indexOf('{', pos)
    if (open === -1) break
    const header = source.slice(pos, open).trim()
    let depth = 1
    let close = open + 1
    for (; close < source.length && depth > 0; close++) {
      if (source[close] === '{') depth++
      else if (source[close] === '}') depth--
    }
    const body = source.slice(open + 1, close - 1)
    if (!header.startsWith('@') && !body.includes('{')) rules.push(`${header} {${body}}`)
    pos = close
  }
  return rules
}

const FACE_RULES = plainRules(NOTCH).filter((rule) => rule.includes('.theme-toggle__face'))

/** The button's name when it comes from its content: visible text, never `display: none` or aria-hidden. */
function nameOf(button: Element): string {
  let name = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      name += node.nodeValue ?? ''
      return
    }
    if (!(node instanceof Element)) return
    if (node.getAttribute('aria-hidden') === 'true') return
    if (getComputedStyle(node).display === 'none') return
    for (const child of node.childNodes) walk(child)
  }
  for (const child of button.childNodes) walk(child)
  return name.replace(/\s+/g, ' ').trim()
}

let host: HTMLDivElement
let style: HTMLStyleElement

/** The server's own markup for the bar, with `rules` as the only stylesheet and no script run. */
function mount(rules: readonly string[]): Element {
  style.textContent = rules.join('\n')
  const server = new DOMParser().parseFromString(
    renderToStaticMarkup(<Header wordmark="RUN APPAREL" />),
    'text/html',
  )
  host.replaceChildren(
    ...[...server.body.childNodes].map((node) => document.importNode(node, true)),
  )
  const button = host.querySelector('button.theme-toggle')
  if (!button) throw new Error('the bar has no theme switch')
  return button
}

beforeEach(() => {
  // `Header` asks the system's preference while it renders; jsdom has no matchMedia of its own.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  localStorage.clear()
  style = document.createElement('style')
  document.head.append(style)
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  style.remove()
  host.remove()
  document.documentElement.removeAttribute('data-theme')
})

describe('the theme switch is named for the page it is on before any script runs (VA-38)', () => {
  it('found the face rules in the shipped stylesheet, or nothing below measures anything', () => {
    // base two + the dark pair inside `:root[data-theme="dark"]`; the media pair is excluded on purpose
    expect(FACE_RULES.length).toBeGreaterThanOrEqual(4)
    expect(FACE_RULES.some((rule) => rule.includes(':root[data-theme="dark"]'))).toBe(true)
  })

  it('writes both names into the markup, with no aria-label, which is why the CSS can choose', () => {
    const button = mount([])
    expect(button.hasAttribute('aria-label')).toBe(false)
    // With no rules at all there is nothing to choose, and the name is both at once.
    expect(nameOf(button)).toBe(`${THEME_SWITCH_NAMES.toDark}${THEME_SWITCH_NAMES.toLight}`)
  })

  for (const [theme, expected] of [
    [null, THEME_SWITCH_NAMES.toDark],
    ['light', THEME_SWITCH_NAMES.toDark],
    ['dark', THEME_SWITCH_NAMES.toLight],
  ] as const) {
    it(`${theme === null ? 'a page with no choice made' : `a ${theme} page`} is named "${expected}"`, () => {
      if (theme) document.documentElement.setAttribute('data-theme', theme)
      expect(nameOf(mount(FACE_RULES))).toBe(expected)
    })
  }

  // NEGATIVE CONTROL: take the dark page's two rules away and the dark page is told the WRONG
  // action, which is the very fault the audit described; so this file can see it.
  it('sees the fault: without the dark page’s face rules, a dark page hears the wrong action', () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    const withoutDark = FACE_RULES.filter((rule) => !rule.includes(':root[data-theme="dark"]'))
    expect(withoutDark.length, 'the control removed nothing').toBeLessThan(FACE_RULES.length)
    expect(nameOf(mount(withoutDark))).toBe(THEME_SWITCH_NAMES.toDark)
  })
})
