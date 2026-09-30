import { FAMILY_PAGE_SOURCES, sourceMatches } from './publicViewerHeaders.mjs'

/**
 * One site, three hostnames, and the rules that give it ONE address.
 *
 * Owner decisions 2026-09-06 (docs/superpowers/specs/2026-09-06-beta-website-launch-design.md):
 *
 *   www.wear-run.help/*         -> 308 https://wear-run.help/<same path>
 *   cms.wear-run.help/<page>    -> 308 https://wear-run.help/<page>   (the four public paths only;
 *                                  the admin, the API, robots.txt and the static files stay)
 *   wear-run.help/admin, /api   -> rewritten under BLOCKED_PREFIX, an unrouted path in the
 *                                  frontend group, so its catch-all calls notFound() and the
 *                                  branded 404 renders with status 404. The admin has exactly
 *                                  one login hostname, as it did before the site existed.
 *
 * WHY CONFIG RULES AND NOT A HANDLER. publicViewerHeaders.mjs carries the account: a
 * header set in a handler shipped green and inert. Config rules land in
 * .next/routes-manifest.json, and src/hostRulesManifest.test.ts reads that file back
 * after every build. `withPayload` wraps only headers(), so these pass through untouched.
 *
 * ⚠️ PATTERNS ARE ANCHORED WITH ESCAPED DOTS, AND THAT IS NOT PEDANTRY. @opennextjs/aws
 * (dist/core/routing/matcher.js) evaluates a `has: host` value as
 * `new RegExp(value).test(host)` — no anchors. A bare `wear-run.help` therefore also
 * matches `cms.wear-run.help`, and the admin rewrite would take the admin down in
 * production while every localhost test stayed green. Next itself anchors; OpenNext
 * does not; the pattern satisfies both.
 */
/*
 * ⚠️ THE SITE MOVED TO wear-run.com ON 2026-09-28 (owner decisions that day: one site on
 * one domain, the 3D garment pages inside it at /products/<product>/<colour>, the back
 * ends — cms., media., the document links — staying on .help). The old addresses forward
 * every path to the same path here, for ever: printed QR tags and sent links must never
 * break. The admin and the API keep their one login hostname, cms.wear-run.help.
 */
export const SITE_HOST = 'wear-run.com'
export const WWW_HOST = 'www.wear-run.com'
export const CMS_HOST = 'cms.wear-run.help'

/** The site's addresses until 2026-09-28. Each forwards every path to SITE_HOST. */
export const OLD_SITE_HOSTS = ['wear-run.help', 'www.wear-run.help']

/**
 * Paths wear-run.com hands BACK to wear-run.help, where whatever answers them still lives.
 *
 * Until the move the email-signature project's Worker (`run-domain-edge`) forwarded ALL of
 * wear-run.com to wear-run.help; these are the paths that relied on it. On wear-run.help,
 * "Map" and "Book Meeting" are zone redirect rules that run BEFORE any Worker
 * (docs/CLOUDFLARE-SETUP.md 11.8), and `/catalogue*` + `/profile*` are the PDF Worker's
 * more specific routes answering 410 — so none of them ever reaches the old-address
 * forward below, and handing them back cannot loop. `scripts/apex-probe.mjs` checks both
 * ends.
 */
export const HANDED_BACK_TO_HELP = [
  '/map',
  '/meeting',
  '/catalogue',
  '/catalogue/:path*',
  '/profile',
  '/profile/:path*',
]
const OLD_SITE_HOME = 'https://wear-run.help'

export const hostPattern = (host) => `^${host.replace(/\./g, '\\.')}$`

/** The public paths the cms host hands to the main address. robots.txt deliberately stays. */
export const CMS_PUBLIC_PATHS = [
  '/',
  '/products',
  '/contact',
  '/privacy',
  '/terms',
  '/sitemap.xml',
  // Added 2026-09-07 with /llms.txt itself: same reasoning as the sitemap above.
  // One description of one business, on the address it describes. robots.txt is the
  // deliberate exception and stays on this host.
  '/llms.txt',
  // The buyer pages (2026-09-30): pages of the site, so the admin host hands them over too.
  ...FAMILY_PAGE_SOURCES,
]

/**
 * Unrouted on purpose. Anything under it matches no route at all and is answered by
 * `src/app/not-found.tsx`, which Next server-renders with a 404.
 *
 * ⚠️ It used to reach a `[...unmatched]` catch-all calling `notFound()`. That path was
 * deleted on 2026-09-07 because `notFound()` does not server-render its page
 * (vercel/next.js#62228) — the 404 was blank without JavaScript. Do not reintroduce a
 * catch-all to "make the 404 use the site layout"; that is exactly what broke it.
 */
export const BLOCKED_PREFIX = '/_not-here'

const onHost = (host) => [{ type: 'host', value: hostPattern(host) }]

export function siteRedirects() {
  return [
    ...HANDED_BACK_TO_HELP.map((source) => ({
      source,
      has: onHost(SITE_HOST),
      destination: `${OLD_SITE_HOME}${source}`,
      permanent: true,
    })),
    // Same shape as the www. pair below, and the root needs its own rule for the same
    // measured reason.
    ...OLD_SITE_HOSTS.flatMap((host) => [
      { source: '/', has: onHost(host), destination: `https://${SITE_HOST}`, permanent: true },
      {
        source: '/:path*',
        has: onHost(host),
        destination: `https://${SITE_HOST}/:path*`,
        permanent: true,
      },
    ]),
    /*
     * ⚠️ THE ROOT NEEDS ITS OWN RULE, AND THE MODEL DID NOT SAY SO. Measured in workerd
     * on 2026-09-07: with only the `/:path*` rule below, `GET www.wear-run.help/`
     * answered `308 Location: https://wear-run.help/:path*` — the literal token,
     * unsubstituted, because `:path*` matches ZERO segments at the root and Next has
     * nothing to interpolate. That is the bare `www` address, the one a person is most
     * likely to type, landing on a 404. Every unit test was green while it did; only
     * the real runtime showed it, which is the whole reason Task 6 exists.
     */
    {
      source: '/',
      has: onHost(WWW_HOST),
      destination: `https://${SITE_HOST}`,
      permanent: true,
    },
    {
      source: '/:path*',
      has: onHost(WWW_HOST),
      destination: `https://${SITE_HOST}/:path*`,
      permanent: true,
    },
    ...CMS_PUBLIC_PATHS.map((path) => ({
      source: path,
      has: onHost(CMS_HOST),
      destination: `https://${SITE_HOST}${path === '/' ? '' : path}`,
      permanent: true,
    })),
  ]
}

export function siteRewrites() {
  return {
    // beforeFiles: evaluated before public/ files and app routes, which is the only
    // phase that can intercept /admin and /api before Payload's own routes claim them.
    beforeFiles: ['/admin', '/admin/:path*', '/api', '/api/:path*'].map((source) => ({
      source,
      has: onHost(SITE_HOST),
      destination: `${BLOCKED_PREFIX}${source}`,
    })),
  }
}

/** Fill `:path*` from the request path, the way Next does for the rules above. */
function fill(destination, source, pathname) {
  if (!source.endsWith('/:path*')) return destination
  const prefix = source.slice(0, -'/:path*'.length)
  const rest = pathname.slice(prefix.length)
  return destination.replace('/:path*', rest === '/' ? (prefix ? '' : '/') : rest)
}

/**
 * A model of the rules for tests — the same shape effectiveHeader() gives headers.
 * Next evaluates redirects before beforeFiles rewrites, and the first match wins.
 */
export function routeFor(host, pathname) {
  const hostOf = (rule) => new RegExp(rule.has[0].value).test(host)
  for (const rule of siteRedirects()) {
    if (hostOf(rule) && sourceMatches(rule.source, pathname)) {
      return { kind: 'redirect', to: fill(rule.destination, rule.source, pathname) }
    }
  }
  for (const rule of siteRewrites().beforeFiles) {
    if (hostOf(rule) && sourceMatches(rule.source, pathname)) {
      return { kind: 'rewrite', to: fill(rule.destination, rule.source, pathname) }
    }
  }
  return { kind: 'serve' }
}
