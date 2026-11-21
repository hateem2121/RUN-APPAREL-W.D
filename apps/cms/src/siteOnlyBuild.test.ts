import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CMS_ONLY_ROUTES,
  FEWEST_ROUTES,
  judgeBuiltRoutes,
  SITE_ROUTES,
} from '../../../scripts/check-site-only-build.mjs'
import {
  CMS_WORKER_BUDGET_KIB,
  judgeWorkerSize,
  SITE_ONLY_WORKER_BUDGET_KIB,
} from '../../../scripts/check-cms-worker-size.mjs'
import {
  buildFlavour,
  SITE_BUILD_PATTERN,
  SITE_ONLY_FLAVOUR,
  SITE_SOURCE_PATHS,
  siteBuildKey,
  siteSourceBuildId,
} from '../siteBuild.mjs'

/**
 * ONE CODEBASE, TWO BUILDS (the admin split, 22 Nov 2026): the whole app for the CMS Worker, and
 * the same code without the admin and the CMS API for the site-only Worker.
 *
 * WHAT PRODUCTION WOULD DO IF THIS WENT WRONG. Both ways are silent, and every website test would
 * still pass:
 *   - the site-only Worker built WITH the admin: it works, and is as big as the Worker it exists
 *     to be smaller than (22,035 KiB against 16,182, measured that day);
 *   - the whole build WITHOUT the admin: the CMS Worker deploys with no sign-in page and no API,
 *     and the garment data on cms.wear-run.help, which every garment page reads, is a 404.
 * The route lists below are what Next wrote for the two builds that day, cut down to what the
 * judge reads; the planted faults are the two builds swapped.
 */
const CMS_SRC = join(import.meta.dirname, '..')
const PAYLOAD_ROUTES = join(CMS_SRC, 'src', 'app', '(payload)')

/** Next's route-file names (the stems its Turbopack scan reads: app_structure.rs, 22 Nov 2026). */
const ROUTE_STEMS = [
  'page',
  'layout',
  'route',
  'not-found',
  'error',
  'global-error',
  'global-not-found',
  'loading',
  'template',
  'default',
  'forbidden',
  'unauthorized',
]

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  )

/** A route file's stem and what follows its FIRST dot, as Next splits the name. */
const split = (file: string) => {
  const name = file.split('/').at(-1) ?? ''
  const dot = name.indexOf('.')
  return { stem: name.slice(0, dot), ending: name.slice(dot + 1) }
}

const routeFilesIn = (dir: string) =>
  walk(dir).filter((file) => ROUTE_STEMS.includes(split(file).stem))

const filler = Array.from({ length: FEWEST_ROUTES }, (_, i) => `/guides/page-${i}`)
const SITE_ONLY_BUILD = [...SITE_ROUTES, ...filler]
const WHOLE_BUILD = [...SITE_ONLY_BUILD, ...CMS_ONLY_ROUTES]

describe('which build is in .next', () => {
  it('the site-only build has the website and neither CMS route', () => {
    expect(judgeBuiltRoutes(SITE_ONLY_BUILD, 'site').ok).toBe(true)
  })

  it('the whole build has both', () => {
    expect(judgeBuiltRoutes(WHOLE_BUILD, 'whole').ok).toBe(true)
  })

  it('PLANTED FAULT: the whole app, built where the site-only build was meant, is refused', () => {
    const verdict = judgeBuiltRoutes(WHOLE_BUILD, 'site')
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toContain('/admin/[[...segments]]')
    expect(verdict.message).toContain('SITE_ONLY=1')
  })

  it('PLANTED FAULT: a whole build that lost the admin or the API is refused, and says which', () => {
    const lostBoth = judgeBuiltRoutes(SITE_ONLY_BUILD, 'whole')
    expect(lostBoth.ok).toBe(false)
    expect(lostBoth.message).toContain('LOST')
    const lostApi = judgeBuiltRoutes([...SITE_ONLY_BUILD, '/admin/[[...segments]]'], 'whole')
    expect(lostApi.ok).toBe(false)
    expect(lostApi.message).toContain('/api/[...slug]')
    expect(lostApi.message).not.toContain('/admin/[[...segments]],')
  })

  it('a route file under (payload) that was not named `.cms.` shows up in the site-only build', () => {
    const verdict = judgeBuiltRoutes([...SITE_ONLY_BUILD, '/api/new-thing'], 'site')
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toContain('/api/new-thing')
  })

  it('an empty or cut-down build is never passed off as a smaller site', () => {
    expect(judgeBuiltRoutes([], 'site').ok).toBe(false)
    expect(judgeBuiltRoutes(SITE_ROUTES.slice(), 'site').ok).toBe(false)
    const noForm = SITE_ONLY_BUILD.filter((route) => route !== '/contact/submit')
    const verdict = judgeBuiltRoutes(noForm, 'site')
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toContain('/contact/submit')
  })
})

describe('the route files the site-only build leaves out', () => {
  it('every route file under src/app/(payload) ends `.cms.tsx` or `.cms.ts`', () => {
    const files = routeFilesIn(PAYLOAD_ROUTES)
    // The five that exist: two layouts-and-fallbacks, the admin page and its fallback, the API.
    expect(files.length).toBeGreaterThanOrEqual(5)
    for (const file of files) {
      expect(split(file).ending, relative(CMS_SRC, file)).toMatch(/^cms\.tsx?$/)
    }
  })

  it('negative control: the website’s own route files do NOT, so both builds read them', () => {
    // A test beside a route (`route.test.ts`) ends `test.ts`, which neither build reads.
    const site = routeFilesIn(join(CMS_SRC, 'src', 'app', '(frontend)')).filter(
      (file) => !split(file).ending.startsWith('test.'),
    )
    expect(site.length).toBeGreaterThan(20)
    for (const file of site) expect(split(file).ending, file).toMatch(/^tsx?$/)
  })

  it('next.config.mjs reads the `.cms.` endings only when the build is not site-only', () => {
    const config = readFileSync(join(CMS_SRC, 'next.config.mjs'), 'utf8')
    expect(config).toMatch(
      /pageExtensions: siteOnlyBuild\(\)\s*\? \['tsx', 'ts', 'jsx', 'js'\]\s*: \['cms\.tsx', 'cms\.ts', 'tsx', 'ts', 'jsx', 'js'\]/,
    )
    expect(config).toContain("const siteOnlyBuild = () => buildFlavour() !== ''")
  })

  it('only SITE_ONLY=1 asks for the site-only build', () => {
    expect(buildFlavour({ SITE_ONLY: '1' })).toBe(SITE_ONLY_FLAVOUR)
    for (const env of [{}, { SITE_ONLY: '' }, { SITE_ONLY: '0' }, { SITE_ONLY: 'true' }]) {
      expect(buildFlavour(env), JSON.stringify(env)).toBe('')
    }
  })
})

/**
 * The two builds must never share a name. They do not share all their script files (7 were only
 * in the site-only build on 22 Nov 2026), so a visitor moved between the Workers by the front
 * door's switch must load a whole page, not tap into pages whose files the other Worker lacks.
 */
describe('the two builds’ names', () => {
  const ids = Object.fromEntries(
    SITE_SOURCE_PATHS.map((path, i) => [path, `${i}`.padStart(40, 'a')]),
  )
  const git = (args: string[]) => {
    if (args[0] === 'status') return ''
    return ids[(args[1] ?? '').replace(/^HEAD:/, '')] ?? ''
  }

  it('one commit gives two different build ids, each in the shape the store accepts', () => {
    const whole = siteSourceBuildId(git, '')
    const siteOnly = siteSourceBuildId(git, SITE_ONLY_FLAVOUR)
    expect(whole).toMatch(/^site-[0-9a-f]{20}$/)
    expect(siteOnly).toMatch(/^site-[0-9a-f]{20}$/)
    expect(siteOnly).not.toBe(whole)
    expect(siteBuildKey(siteOnly, ['a.js'])).toMatch(SITE_BUILD_PATTERN)
  })

  it('each is still the same for the same source', () => {
    expect(siteSourceBuildId(git, SITE_ONLY_FLAVOUR)).toBe(
      siteSourceBuildId(git, SITE_ONLY_FLAVOUR),
    )
    expect(siteSourceBuildId(git, '')).toBe(siteSourceBuildId(git, ''))
  })
})

describe('the site-only Worker’s size budget', () => {
  it('is below the size of the Worker it exists to be smaller than', () => {
    // 22,035 KiB: the whole app on 22 Nov 2026. 18,262: the only site-only size ever timed cold.
    expect(SITE_ONLY_WORKER_BUDGET_KIB).toBeLessThan(18_262)
    expect(SITE_ONLY_WORKER_BUDGET_KIB).toBeLessThan(CMS_WORKER_BUDGET_KIB)
  })

  it('passes the measured site-only build (16,182 KiB)', () => {
    const verdict = judgeWorkerSize(16_182 * 1024, SITE_ONLY_WORKER_BUDGET_KIB, 'Site-only Worker')
    expect(verdict.ok).toBe(true)
    expect(verdict.message).toContain('Site-only Worker 16,182 KiB')
  })

  it('PLANTED FAULT: the whole app uploaded as the site-only Worker (22,035 KiB) fails, and says why', () => {
    const verdict = judgeWorkerSize(22_035 * 1024, SITE_ONLY_WORKER_BUDGET_KIB, 'Site-only Worker')
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toContain('SITE_ONLY=1')
    // The CMS Worker's own budget would have let it through: this budget is the one that sees it.
    expect(judgeWorkerSize(22_035 * 1024).ok).toBe(true)
  })
})
