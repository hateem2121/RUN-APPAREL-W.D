import { describe, expect, it } from 'vitest'
import {
  BLOCKED_PREFIX,
  CMS_HOST,
  hostPattern,
  OLD_SITE_HOSTS,
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
    expect(apex.test('wear-run.com')).toBe(true)
    for (const other of [
      'www.wear-run.com',
      'go.wear-run.com',
      'xwear-run.com',
      'wear-runxcom',
      'wear-run.com.evil',
      'wear-run.help',
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
    // The ROOT has its own rule ahead of the wildcard: `:path*` matches zero segments,
    // so the wildcard alone emitted a literal `https://wear-run.help/:path*` in workerd
    // (measured 2026-09-07). siteHostRules.mjs carries the account.
    expect(routeFor(WWW_HOST, '/')).toEqual({ kind: 'redirect', to: `https://${SITE_HOST}` })
    expect(WWW_HOST).toBe('www.wear-run.com')
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
      // Requested by every browser unbidden, whatever the document declares. Both
      // answered 404 with 17.7 KB of branded error page until 2026-09-16, so they are
      // pinned here as served-not-rewritten alongside the icon they sit beside.
      '/favicon.ico',
      '/apple-touch-icon.png',
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

  /**
   * THE DOMAIN MOVE, 2026-09-28. The site now lives on wear-run.com; wear-run.help and
   * its www. forward every path to the same path there, for ever (owner decision:
   * printed tags and old links must never break).
   */
  it('the old addresses forward every path to the same path on the new one', () => {
    for (const host of OLD_SITE_HOSTS) {
      expect(routeFor(host, '/')).toEqual({ kind: 'redirect', to: `https://${SITE_HOST}` })
      expect(routeFor(host, '/products')).toEqual({
        kind: 'redirect',
        to: `https://${SITE_HOST}/products`,
      })
      expect(routeFor(host, '/products/rxps/wine')).toEqual({
        kind: 'redirect',
        to: `https://${SITE_HOST}/products/rxps/wine`,
      })
      // /admin on an old address lands on the new one, where it is hidden as before.
      expect(routeFor(host, '/admin')).toEqual({
        kind: 'redirect',
        to: `https://${SITE_HOST}/admin`,
      })
    }
    expect(SITE_HOST).toBe('wear-run.com')
    expect(OLD_SITE_HOSTS).toEqual(['wear-run.help', 'www.wear-run.help'])
  })

  /**
   * ⚠️ THESE STAY ANSWERED ON wear-run.help, and wear-run.com hands them back.
   * Until the move, the email project's Worker forwarded ALL of wear-run.com to
   * wear-run.help, which is the only reason `wear-run.com/map` or an old
   * `wear-run.com/catalogue` link worked. On wear-run.help, "Map" and "Book Meeting" are
   * zone redirect rules that run BEFORE any Worker, and `/catalogue*` + `/profile*` are
   * the PDF Worker's more specific routes — so the old-address forward below never sees
   * them there, and the hand-back cannot loop.
   */
  it('hands /map, /meeting and the retired document paths back to wear-run.help', () => {
    for (const path of [
      '/map',
      '/meeting',
      '/catalogue',
      '/catalogue/x',
      '/profile',
      '/profile/x',
    ]) {
      expect(routeFor(SITE_HOST, path), path).toEqual({
        kind: 'redirect',
        to: `https://wear-run.help${path}`,
      })
    }
    // A page that merely starts with the word stays on the site.
    expect(routeFor(SITE_HOST, '/mapping')).toEqual({ kind: 'serve' })
  })

  it('localhost matches no rule at all — the browser suite assumes this', () => {
    for (const path of ['/', '/products', '/admin', '/api/media', '/sitemap.xml']) {
      expect(routeFor('localhost:4174', path), path).toEqual({ kind: 'serve' })
    }
  })
})
