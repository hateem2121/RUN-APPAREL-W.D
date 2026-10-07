import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPANY_PAGE_SOURCES,
  FAMILY_PAGE_SOURCES,
  GUIDE_PAGE_SOURCES,
  POLICY_PAGE_SOURCES,
  PUBLIC_PAGE_SOURCES,
} from '../publicViewerHeaders.mjs'
import {
  gitChangedFiles,
  indexNowSelection,
  pathsForChangedFiles,
} from '../../../scripts/indexnow-paths.mjs'
import { urlsForPaths } from '../../../scripts/ping-indexnow.mjs'

/**
 * scripts/indexnow-paths.mjs decides which public pages a deploy tells search engines about
 * (plan E10, 2026-10-07). Every rule is shown firing AND not firing: a map that answers `[]`
 * for everything looks exactly like a quiet week, and would stop every page being re-indexed
 * after an edit without one failing check.
 */

const ROUTES = 'apps/cms/src/app/(frontend)'

describe('which pages a changed source file tells search engines about', () => {
  it('a changed guide file sends only guide paths', () => {
    const paths = pathsForChangedFiles(['apps/cms/src/lib/guides.ts'])
    expect(paths).toEqual(GUIDE_PAGE_SOURCES)
    expect(paths.every((p: string) => p === '/guides' || p.startsWith('/guides/'))).toBe(true)
  })

  it('the buyer pages, policies and company pages each follow the file that holds their words', () => {
    expect(pathsForChangedFiles(['apps/cms/src/lib/familyPages.ts'])).toEqual(FAMILY_PAGE_SOURCES)
    expect(pathsForChangedFiles(['apps/cms/src/lib/policies.ts'])).toEqual(POLICY_PAGE_SOURCES)
    expect(pathsForChangedFiles(['apps/cms/src/lib/companyPages.ts'])).toEqual(COMPANY_PAGE_SOURCES)
  })

  it('an unrelated change sends nothing (negative control)', () => {
    expect(
      pathsForChangedFiles([
        'apps/shrink/src/index.ts',
        'apps/cms/src/lib/inquiry.ts',
        'README.md',
        'pnpm-lock.yaml',
        '.github/workflows/ci.yml',
        'apps/cms/src/lib/guides.test.ts', // a test changes no page
      ]),
    ).toEqual([])
    expect(pathsForChangedFiles([])).toEqual([])
  })

  it('a route folder sends its own path, and the home page its root', () => {
    expect(pathsForChangedFiles([`${ROUTES}/page.tsx`])).toEqual(['/'])
    expect(pathsForChangedFiles([`${ROUTES}/contact/page.tsx`])).toEqual(['/contact'])
    expect(pathsForChangedFiles([`${ROUTES}/guides/3d-garment-reference/page.tsx`])).toEqual([
      '/guides/3d-garment-reference',
    ])
  })

  it('every public page has a route folder that maps back to exactly its own path', () => {
    // Fails the moment a page joins PUBLIC_PAGE_SOURCES without a route the map understands.
    for (const source of PUBLIC_PAGE_SOURCES) {
      const page = source === '/' ? `${ROUTES}/page.tsx` : `${ROUTES}${source}/page.tsx`
      expect(pathsForChangedFiles([page]), page).toEqual([source])
    }
  })

  it('ignores route files that are not a public page (negative control)', () => {
    expect(pathsForChangedFiles([`${ROUTES}/contact/page.test.ts`])).toEqual([])
    // Not in PUBLIC_PAGE_SOURCES: a draft or private route must never be announced.
    expect(pathsForChangedFiles([`${ROUTES}/not-yet-public/page.tsx`])).toEqual([])
    // The layout and stylesheet touch every page's chrome, not any page's words.
    expect(pathsForChangedFiles([`${ROUTES}/layout.tsx`, `${ROUTES}/site.css`])).toEqual([])
    // Outside the website's route group entirely (the admin).
    expect(pathsForChangedFiles(['apps/cms/src/app/(payload)/admin/page.tsx'])).toEqual([])
  })

  it('a dynamic route folder sends its static prefix when that is a public page', () => {
    expect(pathsForChangedFiles([`${ROUTES}/guides/[slug]/page.tsx`])).toEqual(['/guides'])
    expect(pathsForChangedFiles([`${ROUTES}/not-yet-public/[slug]/page.tsx`])).toEqual([])
  })

  it('merges several changed files into one list, each path once, in site order', () => {
    const paths = pathsForChangedFiles([
      `${ROUTES}/contact/page.tsx`,
      'apps/cms/src/lib/guides.ts',
      `${ROUTES}/guides/page.tsx`,
      `${ROUTES}/page.tsx`,
    ])
    expect(paths).toEqual(
      PUBLIC_PAGE_SOURCES.filter(
        (p: string) => p === '/' || p === '/contact' || GUIDE_PAGE_SOURCES.includes(p),
      ),
    )
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('what a deploy submits', () => {
  const push = { eventName: 'push', before: 'a'.repeat(40) }

  it('sends only the changed pages for a push whose diff is known', () => {
    expect(indexNowSelection(push, () => ['apps/cms/src/lib/guides.ts'])).toEqual({
      mode: 'changed',
      paths: GUIDE_PAGE_SOURCES,
    })
  })

  it('sends nothing when no public page changed', () => {
    expect(indexNowSelection(push, () => ['apps/shrink/src/index.ts'])).toEqual({
      mode: 'none',
      paths: [],
    })
  })

  it('falls back to the whole sitemap when there is no trustworthy base (negative control)', () => {
    const neverCalled = () => {
      throw new Error('git must not be asked without a base')
    }
    // A hand-run workflow_dispatch, a first push (forty zeros), no `before` at all.
    expect(indexNowSelection({ eventName: 'workflow_dispatch' }, neverCalled).mode).toBe('all')
    expect(indexNowSelection({ eventName: 'push', before: '0'.repeat(40) }, neverCalled).mode).toBe(
      'all',
    )
    expect(indexNowSelection({ eventName: 'push' }, neverCalled).mode).toBe('all')
    expect(indexNowSelection({}, neverCalled).mode).toBe('all')
  })

  it('falls back to the whole sitemap when git cannot answer', () => {
    expect(indexNowSelection(push, () => null).mode).toBe('all')
  })
})

describe('reading the changed files from real git history', () => {
  function repo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'indexnow-'))
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const write = (file: string, text: string) => {
      mkdirSync(dirname(join(dir, file)), { recursive: true })
      writeFileSync(join(dir, file), text)
    }
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 't@example.com')
    git('config', 'user.name', 't')
    git('config', 'commit.gpgsign', 'false')
    write('apps/cms/src/lib/guides.ts', 'v1')
    write('README.md', 'v1')
    write('apps/cms/src/lib/old.ts', 'v1')
    git('add', '-A')
    git('commit', '-q', '-m', 'one')
    write('apps/cms/src/lib/guides.ts', 'v2')
    git('rm', '-q', 'apps/cms/src/lib/old.ts')
    git('add', '-A')
    git('commit', '-q', '-m', 'two')
    return dir
  }

  it('lists what changed since the base, deletions included', () => {
    const dir = repo()
    const base = execFileSync('git', ['rev-parse', 'HEAD~1'], { cwd: dir, encoding: 'utf8' }).trim()
    const files = gitChangedFiles(base, { cwd: dir, fetchMissing: false })
    expect(files?.sort()).toEqual(['apps/cms/src/lib/guides.ts', 'apps/cms/src/lib/old.ts'])
    expect(pathsForChangedFiles(files ?? [])).toEqual(GUIDE_PAGE_SOURCES)
  })

  it('answers null for a base this checkout cannot see, instead of an empty list', () => {
    // [] would read as "nothing changed" and silently skip the ping; null makes the caller
    // fall back to the whole sitemap.
    const dir = repo()
    expect(gitChangedFiles('b'.repeat(40), { cwd: dir, fetchMissing: false })).toBeNull()
  })

  it('answers null when the missing base cannot be fetched either (no network is used)', () => {
    // This repository has no `origin`, so the one-commit fetch of the deploy job fails at
    // once; the answer must still be null, never an empty list.
    const dir = repo()
    expect(gitChangedFiles('b'.repeat(40), { cwd: dir })).toBeNull()
  })
})

describe('turning paths into the URLs IndexNow is sent', () => {
  it('uses the bare origin for the home page, as the sitemap does, and origin plus path otherwise', () => {
    expect(urlsForPaths('https://wear-run.com', ['/', '/guides/3d-garment-reference'])).toEqual([
      'https://wear-run.com',
      'https://wear-run.com/guides/3d-garment-reference',
    ])
  })
})
