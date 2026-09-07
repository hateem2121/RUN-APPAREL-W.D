import { describe, expect, it } from 'vitest'
import {
  BLOCKED_PREFIX,
  CMS_HOST,
  hostPattern,
  routeFor,
  SITE_HOST,
  siteRedirects,
  siteRewrites,
  WWW_HOST,
} from '../siteHostRules.mjs'

/**
 * The site answers on three hostnames and only these rules tell them apart.
 * Owner decisions 2026-09-06: www -> the main address; the cms host's public pages ->
 * the main address; /admin and /api typed on the main address -> the site's 404.
 *
 * ⚠️ THE ANCHORING TESTS ARE THE IMPORTANT ONES. @opennextjs/aws evaluates a
 * `has: host` value with `new RegExp(value).test(host)` — unanchored — so a pattern of
 * `wear-run.help` also matches `cms.wear-run.help`, and the admin rewrite would then
 * take the admin down. Every localhost test would stay green while it did.
 */
describe('host patterns are anchored and escaped', () => {
  it('matches exactly the host, as OpenNext evaluates it', () => {
    const apex = new RegExp(hostPattern(SITE_HOST))
    expect(apex.test('wear-run.help')).toBe(true)
    for (const other of [
      'cms.wear-run.help',
      'www.wear-run.help',
      'xwear-run.help',
      'wear-runxhelp',
      'wear-run.help.evil',
    ]) {
      expect(apex.test(other), `${other} must not match the apex pattern`).toBe(false)
    }
  })

  it('every rule carries exactly one host condition', () => {
    for (const rule of [...siteRedirects(), ...siteRewrites().beforeFiles]) {
      expect(rule.has).toHaveLength(1)
      // Destructured rather than indexed: the module is .mjs, so `has[0]` is
      // possibly-undefined under noUncheckedIndexedAccess and `next build` refuses it.
      // `undefined` still fails both assertions below, so nothing is weakened.
      const [condition] = rule.has
      expect(condition?.type).toBe('host')
      expect(condition?.value).toMatch(/^\^.*\$$/)
    }
  })

  it('every redirect is permanent', () => {
    for (const rule of siteRedirects()) expect(rule.permanent).toBe(true)
  })
})

describe('routeFor — what each hostname does with a path', () => {
  it('www sends everything to the main address, same path', () => {
    expect(routeFor(WWW_HOST, '/products')).toEqual({
      kind: 'redirect',
      to: `https://${SITE_HOST}/products`,
    })
    expect(routeFor(WWW_HOST, '/')).toEqual({ kind: 'redirect', to: `https://${SITE_HOST}/` })
    // Never reached in production — the PDF Worker's narrower www route wins first —
    // but if it were, it would still land on the PDF.
    expect(routeFor(WWW_HOST, '/catalogue')).toEqual({
      kind: 'redirect',
      to: `https://${SITE_HOST}/catalogue`,
    })
  })

  it('the cms host redirects its public pages and keeps everything else', () => {
    for (const path of ['/', '/products', '/contact', '/sitemap.xml']) {
      expect(routeFor(CMS_HOST, path).kind, path).toBe('redirect')
    }
    expect(routeFor(CMS_HOST, '/products')).toEqual({
      kind: 'redirect',
      to: `https://${SITE_HOST}/products`,
    })
    expect(routeFor(CMS_HOST, '/')).toEqual({ kind: 'redirect', to: `https://${SITE_HOST}` })
    for (const path of [
      '/admin',
      '/admin/collections/products',
      '/api/media',
      '/api/public/viewer/rxps/wine',
      '/robots.txt',
      '/og-default.png',
      '/icon.svg',
    ]) {
      expect(routeFor(CMS_HOST, path), path).toEqual({ kind: 'serve' })
    }
  })

  it('the main address serves the site and hides the admin and the API behind the 404', () => {
    for (const path of ['/', '/products', '/contact', '/robots.txt', '/sitemap.xml', '/nope']) {
      expect(routeFor(SITE_HOST, path), path).toEqual({ kind: 'serve' })
    }
    expect(routeFor(SITE_HOST, '/admin')).toEqual({
      kind: 'rewrite',
      to: `${BLOCKED_PREFIX}/admin`,
    })
    expect(routeFor(SITE_HOST, '/admin/collections/products')).toEqual({
      kind: 'rewrite',
      to: `${BLOCKED_PREFIX}/admin/collections/products`,
    })
    expect(routeFor(SITE_HOST, '/api/media')).toEqual({
      kind: 'rewrite',
      to: `${BLOCKED_PREFIX}/api/media`,
    })
    // and a path that merely STARTS with the word is not the admin
    expect(routeFor(SITE_HOST, '/administration')).toEqual({ kind: 'serve' })
  })

  it('localhost matches no rule at all — the browser suite assumes this', () => {
    for (const path of ['/', '/products', '/admin', '/api/media', '/sitemap.xml']) {
      expect(routeFor('localhost:4174', path), path).toEqual({ kind: 'serve' })
    }
  })
})
