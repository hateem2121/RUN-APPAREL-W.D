import { sourceMatches } from './publicViewerHeaders.mjs'

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
export const SITE_HOST = 'wear-run.help'
export const WWW_HOST = 'www.wear-run.help'
export const CMS_HOST = 'cms.wear-run.help'

export const hostPattern = (host) => `^${host.replace(/\./g, '\\.')}$`

/** The public paths the cms host hands to the main address. robots.txt deliberately stays. */
export const CMS_PUBLIC_PATHS = ['/', '/products', '/contact', '/sitemap.xml']

/**
 * Unrouted on purpose. Anything under it reaches the frontend group's catch-all
 * (src/app/(frontend)/[...unmatched]/page.tsx), which calls notFound().
 */
export const BLOCKED_PREFIX = '/_not-here'

const onHost = (host) => [{ type: 'host', value: hostPattern(host) }]

export function siteRedirects() {
  return [
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
