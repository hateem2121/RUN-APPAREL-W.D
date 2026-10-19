import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inlineStylesheets } from './inlineStylesheet.mjs'

const SHELL =
  '<head><meta charset="UTF-8" /><meta name="viewport" content="x" />' +
  '<script type="module" crossorigin src="/assets/index-a.js"></script>' +
  '<link rel="stylesheet" crossorigin href="/assets/index-a.css">' +
  '<link rel="preload" as="font" href="/assets/f.woff2" crossorigin=""></head>'

describe('inlineStylesheets', () => {
  it('moves the stylesheet into <style>, straight after the charset and before every request', () => {
    const out = inlineStylesheets(SHELL, (href) => (href === '/assets/index-a.css' ? 'a{b:c}' : ''))
    expect(out).toContain('<meta charset="UTF-8" /><style>a{b:c}</style><meta name="viewport"')
    expect(out).not.toContain('rel="stylesheet"')
    // The point of the placement: its bytes arrive before the app script's tag does.
    expect(out.indexOf('<style>')).toBeLessThan(out.indexOf('<script'))
  })

  it('leaves a link alone when the build has no such file', () => {
    expect(inlineStylesheets(SHELL, () => undefined)).toBe(SHELL)
  })

  it('does not touch a stylesheet that is not one of the bundle assets', () => {
    const html =
      '<head><meta charset="UTF-8"><link rel="stylesheet" href="https://x.test/a.css"></head>'
    expect(inlineStylesheets(html, () => 'never')).toBe(html)
  })

  it('refuses text that would close the style element early', () => {
    expect(() => inlineStylesheets(SHELL, () => 'a{}</style><b>')).toThrow(/<\/style/)
  })

  it('opens the head with it when there is no charset tag to follow', () => {
    const html = '<head><link rel="stylesheet" href="/assets/i.css"></head>'
    expect(inlineStylesheets(html, () => 'x{}')).toBe('<head><style>x{}</style></head>')
  })

  it('inlines two stylesheets in their original order', () => {
    const html =
      '<head><meta charset="UTF-8"><link rel="stylesheet" href="/assets/a.css"><link rel="stylesheet" href="/assets/b.css"></head>'
    const out = inlineStylesheets(html, (href) => (href.includes('/a.') ? 'A{}' : 'B{}'))
    expect(out).toBe('<head><meta charset="UTF-8"><style>A{}</style><style>B{}</style></head>')
  })
})

const BUILT = join(import.meta.dirname, '..', 'dist', 'index.html')

describe.skipIf(!existsSync(BUILT))('the built index.html', () => {
  it('carries the main stylesheet inline and requests no render-blocking stylesheet of its own', () => {
    const html = readFileSync(BUILT, 'utf8')
    expect(html).not.toMatch(/<link[^>]*rel="stylesheet"/)
    const style = /<meta charset[^>]*>\s*<style>([\s\S]*?)<\/style>/.exec(html)
    expect(style, 'no <style> straight after the charset tag').not.toBeNull()
    // Real content, not an empty element: a rule from each of the files main.tsx imports.
    expect(style?.[1].length).toBeGreaterThan(30_000)
    expect(style?.[1]).toContain('.preloader')
    expect(style?.[1]).toContain('.notch')
    expect(style?.[1]).toContain('.site-footer')
  })
})
