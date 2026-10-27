import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param.js'
import { describe, expect, it } from 'vitest'
import { KEPT_RENDER_HEADERS } from '../pageCache.mjs'
import {
  BROWSER_VARY,
  intentTreeFor,
  keepableTapAnswer,
  keepableTapRequest,
  keptTapHeaders,
  keptTapStoreKey,
  rscCode,
  STATE_TREE_MAX_BYTES,
  servedTapHeaders,
  stateTreeFor,
  TAP_VARY,
  tapDrawRequest,
  tapStoreOn,
} from '../tapStore.mjs'

/**
 * Keeping Next.js tap data in the shared store (faster-taps spec, Part 1). Every value below was
 * captured from a real Chromium tap on the live site, 27 Oct 2026: `next-router-state-tree` as the
 * browser sent it, after the link's route had been prefetched (a settled tap).
 */
const enc = encodeURIComponent
const PRODUCTS_FROM_HOME = enc(
  '["",{"children":["(frontend)",{"children":["products",{"children":["__PAGE__",{},null,null,0]},null,"refetch",0]},null,null,16]},null,null,16]',
)
const CONTACT_FROM_HOME = enc(
  '["",{"children":["(frontend)",{"children":["contact",{"children":["__PAGE__",{},null,null,0]},null,"refetch",0]},null,null,16]},null,null,16]',
)
const HOME_FROM_FAQ = enc(
  '["",{"children":["(frontend)",{"children":["__PAGE__",{},null,"refetch",0]},null,null,16]},null,null,16]',
)
const GUIDE_FROM_GUIDES = enc(
  '["",{"children":["(frontend)",{"children":["guides",{"children":["how-a-private-label-order-works",{"children":["__PAGE__",{},null,null,0]},null,"refetch",0]},null,null,0]},null,null,16]},null,null,16]',
)
/**
 * What a link HOVERED on the live site sends (IntentLink's whole-page fetch), captured in Chromium on
 * 27 Oct after the review asked whether it matches a tap: it does not. The same tree with each
 * segment's trailing empty values left off, and the same from /faq and from /products.
 */
const CONTACT_ON_INTENT = enc(
  '["",{"children":["(frontend)",{"children":["contact",{"children":["__PAGE__",{}]},null,"refetch"]},null,null,16]},null,null,16]',
)
const FAQ_TOPIC_ON_INTENT = enc(
  '["",{"children":["(frontend)",{"children":["faq",{"children":["orders-and-samples",{"children":["__PAGE__",{}]},null,"refetch"]}]},null,null,16]},null,null,16]',
)

const kv = (values: Record<string, string | null>) => ({
  get: async (key: string) => values[key] ?? null,
})

async function tap(
  path: string,
  headers: Record<string, string>,
  {
    code,
    extraQuery = '',
    host = 'wear-run.com',
  }: { code?: string; extraQuery?: string; host?: string } = {},
) {
  const value =
    code ??
    (await rscCode({
      prefetch: headers['next-router-prefetch'],
      segmentPrefetch: headers['next-router-segment-prefetch'],
      stateTree: headers['next-router-state-tree'],
      nextUrl: headers['next-url'],
    }))
  return new Request(`https://${host}${path}?_rsc=${value}${extraQuery}`, { headers })
}

const productsTap = { rsc: '1', 'next-router-state-tree': PRODUCTS_FROM_HOME, 'next-url': '/faq' }

describe('rscCode is Next.js 16.4.3’s own cache-busting code', () => {
  it('matches the code the browser sent for the /products tap from /faq', async () => {
    const code = await rscCode({ stateTree: PRODUCTS_FROM_HOME, nextUrl: '/faq' })
    expect(code).toBe('ewbMhPsdg9BCpK4z')
    expect(code).toBe(
      await computeCacheBustingSearchParam(undefined, undefined, PRODUCTS_FROM_HOME, '/faq'),
    )
  })

  it('matches Next without a start page, for a tree prefetch, and when nothing is sent', async () => {
    expect(await rscCode({ stateTree: PRODUCTS_FROM_HOME })).toBe(
      await computeCacheBustingSearchParam(undefined, undefined, PRODUCTS_FROM_HOME, undefined),
    )
    expect(await rscCode({ prefetch: '1', segmentPrefetch: '/_tree' })).toBe(
      await computeCacheBustingSearchParam('1', '/_tree', undefined, undefined),
    )
    expect(await rscCode({})).toBe('')
  })
})

describe('keepableTapRequest', () => {
  it('keeps a real tap: rsc, its tree, and the code that matches them', async () => {
    expect(await keepableTapRequest(await tap('/products', productsTap))).toBe(true)
  })

  it.each([
    [
      'a code that does not match the headers',
      () => tap('/products', productsTap, { code: 'AAAAAAAAAAAAAAAA' }),
    ],
    ['the legacy 5-character code', () => tap('/products', productsTap, { code: 'abcde' })],
    ['any query besides _rsc', () => tap('/products', productsTap, { extraQuery: '&family=x' })],
    ['the admin host', () => tap('/products', productsTap, { host: 'cms.wear-run.help' })],
    ['the admin path', () => tap('/admin', productsTap)],
    ['a server action', () => tap('/products', { ...productsTap, 'next-action': 'x' })],
    ['a CMS login', () => tap('/products', { ...productsTap, cookie: 'payload-token=x' })],
    ['a draft cookie', () => tap('/products', { ...productsTap, cookie: '__prerender_bypass=x' })],
    [
      'a tree longer than the cap',
      () =>
        tap('/products', {
          ...productsTap,
          'next-router-state-tree': 'x'.repeat(STATE_TREE_MAX_BYTES + 1),
        }),
    ],
    [
      'no rsc header',
      () => tap('/products', { 'next-router-state-tree': PRODUCTS_FROM_HOME, 'next-url': '/faq' }),
    ],
  ])('refuses %s', async (_name, make) => {
    expect(await keepableTapRequest(await make())).toBe(false)
  })

  it('refuses a POST', async () => {
    const real = await tap('/products', productsTap)
    expect(
      await keepableTapRequest(new Request(real.url, { method: 'POST', headers: real.headers })),
    ).toBe(false)
  })
})

describe('tapDrawRequest: what one visitor sends never shapes the copy everyone gets', () => {
  it('carries only the kept-render headers and the four router headers, never next-url or a cookie', async () => {
    const visitor = await tap('/products', {
      ...productsTap,
      cookie: 'consent=1',
      'user-agent': 'Visitor/1.0',
    })
    const drawn = await tapDrawRequest(visitor)
    const names = [...drawn.headers.keys()].sort()
    expect(names).toEqual(
      [...Object.keys(KEPT_RENDER_HEADERS), 'next-router-state-tree', 'rsc'].sort(),
    )
    expect(drawn.headers.get('user-agent')).toBe(KEPT_RENDER_HEADERS['user-agent'])
  })

  it('recomputes _rsc for the headers it sends, so Next’s own check passes', async () => {
    const drawn = await tapDrawRequest(await tap('/products', productsTap))
    expect(new URL(drawn.url).searchParams.get('_rsc')).toBe(
      await rscCode({ stateTree: PRODUCTS_FROM_HOME }),
    )
  })

  it('gives one draw address whatever page the tap started from', async () => {
    const fromFaq = await tapDrawRequest(await tap('/products', productsTap))
    const fromContact = await tapDrawRequest(
      await tap('/products', { ...productsTap, 'next-url': '/contact' }),
    )
    expect(fromFaq.url).toBe(fromContact.url)
  })
})

describe('keptTapStoreKey', () => {
  const url = 'https://wear-run.com/products?_rsc=abc'

  it('holds the host, the deploy and the path with its code', async () => {
    expect(await keptTapStoreKey(url, 'deploy-1', kv({}))).toBe(
      '/__kept-rsc/wear-run.com/deploy-1/live/products?_rsc=abc',
    )
  })

  it('never lets a copy cross deploys', async () => {
    expect(await keptTapStoreKey(url, 'deploy-1', kv({}))).not.toBe(
      await keptTapStoreKey(url, 'deploy-2', kv({})),
    )
  })

  it('follows the page store’s off switch for the content version', async () => {
    const versioned = kv({ 'page-store-mode': 'versioned', 'content-version': 'v9' })
    expect(await keptTapStoreKey(url, 'deploy-1', versioned)).toBe(
      '/__kept-rsc/wear-run.com/deploy-1/v9/products?_rsc=abc',
    )
  })
})

describe('keepableTapAnswer', () => {
  const answer = (status: number, headers: Record<string, string> = {}) =>
    new Response('0:["$","div",null,{}]\n', {
      status,
      headers: { 'content-type': 'text/x-component', ...headers },
    })
  const body = '0:["$","div",null,{}]\n'

  it('keeps a whole 200 of tap data', () => {
    expect(keepableTapAnswer(answer(200), body)).toBe(true)
  })

  it.each([
    ['a 404 (a missing journal post)', answer(404)],
    ['a 307 (Next correcting a code)', answer(307)],
    ['a cookie', answer(200, { 'set-cookie': 'a=b' })],
    ['vary *', answer(200, { vary: '*' })],
    ['a compressed body', answer(200, { 'content-encoding': 'gzip' })],
    ['an HTML page', new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })],
  ])('refuses %s', (_name, response) => {
    expect(keepableTapAnswer(response, body)).toBe(false)
  })

  // React's Flight server writes a server error as `<hex id>:E{"digest":…}` (emitErrorChunk in
  // next/dist/compiled/react-server-dom-turbopack, server.edge.production.js).
  it('refuses a payload that carries a server error row', () => {
    const broken = `0:["$","div",null,{}]\n1a:E{"digest":"2471862035"}\n`
    expect(keepableTapAnswer(answer(200), broken)).toBe(false)
  })
})

describe('kept and served headers', () => {
  it('a kept copy is tagged with the pages and varies on the four router headers', () => {
    const kept = keptTapHeaders({
      'content-type': 'text/x-component',
      vary: 'Sec-CH-Prefers-Color-Scheme',
    })
    expect(kept.get('cache-tag')).toBe('site-pages')
    expect(kept.get('vary')).toBe(TAP_VARY)
    expect(TAP_VARY).toBe(
      'rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch',
    )
    expect(kept.get(BROWSER_VARY)).toBe('Sec-CH-Prefers-Color-Scheme')
  })

  it('the visitor gets the site’s own Vary back, and none of the bookkeeping', () => {
    const served = servedTapHeaders(
      keptTapHeaders({ 'content-type': 'text/x-component', vary: 'Sec-CH-Prefers-Color-Scheme' }),
    )
    expect(served.get('vary')).toBe('Sec-CH-Prefers-Color-Scheme')
    expect(served.has(BROWSER_VARY)).toBe(false)
    expect(served.has('cache-tag')).toBe(false)
  })
})

describe('tapStoreOn: the off switch', () => {
  it('is off only for the value "off"', async () => {
    expect(await tapStoreOn(kv({ 'rsc-store': 'off' }))).toBe(false)
    expect(await tapStoreOn(kv({}))).toBe(true)
    expect(await tapStoreOn(kv({ 'rsc-store': 'on' }))).toBe(true)
  })
})

describe('stateTreeFor: the header a settled tap sends', () => {
  it('builds the trees captured from real taps', () => {
    expect(stateTreeFor('/products', '/')).toBe(PRODUCTS_FROM_HOME)
    expect(stateTreeFor('/contact', '/')).toBe(CONTACT_FROM_HOME)
    expect(stateTreeFor('/', '/faq')).toBe(HOME_FROM_FAQ)
    expect(stateTreeFor('/guides/how-a-private-label-order-works', '/guides')).toBe(
      GUIDE_FROM_GUIDES,
    )
  })

  it('cannot build a dynamic route, so it returns null', () => {
    expect(stateTreeFor('/journal/some-post', '/')).toBeNull()
    expect(stateTreeFor('/case-studies/x', '/')).toBeNull()
  })
})

describe('intentTreeFor: the header a hovered, focused or touched link sends', () => {
  it('builds the trees captured from real hovers on the live site', () => {
    expect(intentTreeFor('/contact', '/faq')).toBe(CONTACT_ON_INTENT)
    expect(intentTreeFor('/contact', '/products')).toBe(CONTACT_ON_INTENT)
    expect(intentTreeFor('/faq/orders-and-samples', '/faq')).toBe(FAQ_TOPIC_ON_INTENT)
    expect(intentTreeFor('/faq/orders-and-samples', '/faq/shipping-and-importing')).toBe(
      FAQ_TOPIC_ON_INTENT,
    )
  })

  it("differs from the tap's tree, so a hover asks the store under a key of its own", () => {
    expect(intentTreeFor('/contact', '/faq')).not.toBe(stateTreeFor('/contact', '/faq'))
  })

  it('cannot build a dynamic route, so it returns null', () => {
    expect(intentTreeFor('/journal/some-post', '/')).toBeNull()
  })
})
