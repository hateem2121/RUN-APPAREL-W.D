#!/usr/bin/env node
/**
 * Which of the two builds is in apps/cms/.next, and is it the one that was meant?
 *
 *   node scripts/check-site-only-build.mjs --whole   # after `pnpm build`: the CMS Worker's build
 *   node scripts/check-site-only-build.mjs --site    # after the SITE_ONLY=1 build
 *
 * WHY (the admin split, 22 Nov 2026). One codebase is built twice: whole, for the CMS Worker, and
 * with `SITE_ONLY=1` for the site-only Worker, which leaves out the admin and the CMS API
 * (apps/cms/next.config.mjs `pageExtensions`: the five route files under `src/app/(payload)` end
 * `.cms.tsx` / `.cms.ts`, and only the whole build reads those endings). Both builds write the
 * same folders, one after the other, and both ways of getting it wrong are silent:
 *
 *   - the site-only Worker uploaded from the WHOLE build works perfectly and is simply as big as
 *     the Worker it was made to be smaller than (22,035 KiB against 16,182, measured that day);
 *   - the CMS Worker uploaded from a build that LOST those endings has no admin and no API. Every
 *     website test still passes, and the owner finds out when the sign-in page is a 404.
 *
 * So this reads the route list Next itself wrote (`.next/app-path-routes-manifest.json`) and says
 * which build it is. It prints route counts only.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The two routes only the CMS Worker has, as Next names them. */
export const CMS_ONLY_ROUTES = Object.freeze(['/admin/[[...segments]]', '/api/[...slug]'])

/**
 * Routes BOTH builds must have: one of each kind the website is made of (a page, a form's
 * handler, a generated file, a Russian page). A build without them is not a smaller site, it is a
 * broken one, and "no admin routes" alone would pass an empty build.
 */
export const SITE_ROUTES = Object.freeze([
  '/',
  '/contact',
  '/contact/submit',
  '/careers/submit',
  '/products',
  '/ru',
  '/sitemap.xml',
  '/robots.txt',
  '/llms.txt',
])

/** Fewer routes than this is not this website (142 in the site-only build on 22 Nov 2026). */
export const FEWEST_ROUTES = 100

/**
 * @param {string[]} routes the route paths Next built
 * @param {'whole' | 'site'} expected
 * @returns {{ ok: boolean, message: string }}
 */
export function judgeBuiltRoutes(routes, expected) {
  const built = new Set(routes)
  const missing = SITE_ROUTES.filter((route) => !built.has(route))
  if (built.size < FEWEST_ROUTES || missing.length > 0) {
    return {
      ok: false,
      message:
        `the build has ${built.size} routes and lacks ${missing.length} the website needs` +
        (missing.length ? ` (${missing.join(', ')})` : '') +
        '. That is not a smaller site, it is a broken build.',
    }
  }
  const cmsOnly = CMS_ONLY_ROUTES.filter((route) => built.has(route))
  // Anything else under /admin or /api is a route file that was not named `.cms.` (see below).
  const strays = [...built].filter(
    (route) => /^\/(?:admin|api)(?:\/|$)/.test(route) && !CMS_ONLY_ROUTES.includes(route),
  )
  if (expected === 'site') {
    if (cmsOnly.length > 0 || strays.length > 0) {
      return {
        ok: false,
        message:
          `the site-only build still holds ${[...cmsOnly, ...strays].join(', ')}. Either it was ` +
          'built without SITE_ONLY=1 (this is then the whole app, and the site-only Worker would ' +
          'be as big as the CMS Worker), or a route file under src/app/(payload) is named ' +
          '`page.tsx` / `route.ts` instead of `.cms.tsx` / `.cms.ts`.',
      }
    }
    return { ok: true, message: `site-only build: ${built.size} routes, no admin and no CMS API.` }
  }
  if (cmsOnly.length !== CMS_ONLY_ROUTES.length) {
    const lost = CMS_ONLY_ROUTES.filter((route) => !built.has(route))
    return {
      ok: false,
      message:
        `the whole build has LOST ${lost.join(', ')}: the CMS Worker would deploy without its ` +
        'admin or its API. Check `pageExtensions` in apps/cms/next.config.mjs still lists ' +
        '`cms.tsx` and `cms.ts` when SITE_ONLY is not 1, and that SITE_ONLY is not set here.',
    }
  }
  return { ok: true, message: `whole build: ${built.size} routes, admin and CMS API present.` }
}

function main(args) {
  const expected = args.includes('--site') ? 'site' : args.includes('--whole') ? 'whole' : null
  if (!expected) {
    console.error('usage: check-site-only-build.mjs --whole | --site')
    return 2
  }
  const cms = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'apps', 'cms')
  const manifest = join(cms, '.next', 'app-path-routes-manifest.json')
  if (!existsSync(manifest)) {
    console.error(`::error::${manifest} is not there: build first, so the routes were NOT checked.`)
    return 1
  }
  const routes = Object.values(JSON.parse(readFileSync(manifest, 'utf8')))
  const verdict = judgeBuiltRoutes(routes, expected)
  if (!verdict.ok) {
    console.error(`::error::${verdict.message}`)
    return 1
  }
  console.log(`✓ ${verdict.message}`)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
