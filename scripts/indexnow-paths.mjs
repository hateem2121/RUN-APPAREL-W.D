/**
 * Which public pages a deploy should tell search engines about (plan E10, owner-approved
 * 2026-10-07).
 *
 * WHY. `ping-indexnow.mjs` used to send the whole sitemap after every deploy. IndexNow's own
 * documentation (https://www.indexnow.org/documentation, read 2026-10-07) says to submit only
 * URLs that were "changed, added, or deleted" rather than repeating unchanged ones, so a deploy
 * that touched the shrink Worker was announcing every page as new. This module turns the files
 * a commit changed into the public paths they affect; the script sends only those, and sends
 * nothing when no public page changed.
 *
 * ⚠️ THE PATHS ARE NEVER RETYPED HERE. They come from the lists in
 * `apps/cms/publicViewerHeaders.mjs` (the same ones the CSP rules, the redirects and the
 * sitemap are held to), so a page cannot be known to one and not the other. A route folder
 * only counts when its path is in `PUBLIC_PAGE_SOURCES`: an unlisted or draft route is never
 * announced. That list is where a new page has to be added anyway (it ships with no CSP
 * until it is), so announcing it needs no second step.
 *
 * ⚠️ WHAT IS DELIBERATELY NOT MAPPED. The layout and stylesheet change every page's chrome,
 * not any page's words; announcing all pages for a footer tweak is the over-submission this
 * file exists to stop. Garment pages (`/products/<product>/<colour>`) are DATA in D1, not a
 * commit, so no diff can name them. Journal posts are announced by their own publish hook,
 * not here.
 *
 * Plain Node, no dependencies, so `ci.yml`'s deploy job can run it before anything else is
 * installed beyond what it already has.
 */
import { execFileSync } from 'node:child_process'
import {
  COMPANY_PAGE_SOURCES,
  FAMILY_PAGE_SOURCES,
  GUIDE_PAGE_SOURCES,
  POLICY_PAGE_SOURCES,
  PUBLIC_PAGE_SOURCES,
} from '../apps/cms/publicViewerHeaders.mjs'
import { baseFor } from './ci-changed-paths.mjs'

/** The website's route group. Anything outside it (the admin, the API) is never announced. */
const ROUTE_ROOT = 'apps/cms/src/app/(frontend)/'

/**
 * A source file that holds the words of SEVERAL pages → all of those pages.
 *
 * Keys are matched against a list of changed files, never opened, so a key for a file that
 * does not exist yet is harmless: it simply never matches. ⚠️ THIS IS THE PLACE FOR THE NEXT
 * ONE. When the FAQ and glossary pages land (`apps/cms/src/lib/faqs.ts`,
 * `apps/cms/src/lib/glossary.ts`), add their key here with the paths read from the list that
 * holds them in `publicViewerHeaders.mjs`, exactly as the four below do.
 */
export const SOURCE_FILE_PATHS = {
  'apps/cms/src/lib/guides.ts': GUIDE_PAGE_SOURCES,
  'apps/cms/src/lib/familyPages.ts': FAMILY_PAGE_SOURCES,
  'apps/cms/src/lib/policies.ts': POLICY_PAGE_SOURCES,
  'apps/cms/src/lib/companyPages.ts': COMPANY_PAGE_SOURCES,
}

/**
 * The page a file under a route folder belongs to, or null.
 *
 * `(frontend)/guides/foo/page.tsx` → `/guides/foo`; `(frontend)/page.tsx` → `/`. Under a
 * dynamic folder (`guides/[slug]/page.tsx`) the static prefix counts (`/guides`, the index that
 * lists them); the instance pages are not knowable from a diff. A `*.test.*` changes no page.
 * Any other file inside a route's own folder counts (a component or stylesheet that only that
 * page uses); directly in `(frontend)/` only `page.tsx` does, because the layout, stylesheet
 * and error boundary there are chrome.
 *
 * @param {string} file
 * @returns {string | null}
 */
function routePathFor(file) {
  if (!file.startsWith(ROUTE_ROOT)) return null
  const segments = file.slice(ROUTE_ROOT.length).split('/')
  const name = segments.pop() ?? ''
  if (/\.test\.[cm]?[jt]sx?$/.test(name)) return null
  const staticSegments = []
  for (const segment of segments) {
    if (segment.startsWith('[')) break
    staticSegments.push(segment)
  }
  if (segments.length === 0 && !/^page\.[cm]?[jt]sx?$/.test(name)) return null
  const path = `/${staticSegments.join('/')}`
  return PUBLIC_PAGE_SOURCES.includes(path) ? path : null
}

/**
 * @param {readonly string[]} files repo-relative paths from `git diff --name-only`
 * @returns {string[]} public paths, each once, in `PUBLIC_PAGE_SOURCES` order
 */
export function pathsForChangedFiles(files) {
  const hit = new Set()
  for (const file of files) {
    for (const path of SOURCE_FILE_PATHS[file] ?? []) hit.add(path)
    const route = routePathFor(file)
    if (route !== null) hit.add(route)
  }
  return PUBLIC_PAGE_SOURCES.filter((path) => hit.has(path))
}

/**
 * Files changed between `base` and HEAD, or null when git cannot say.
 *
 * ⚠️ `null` AND `[]` ARE DIFFERENT ANSWERS. `[]` means "nothing changed" and skips the ping;
 * `null` means "could not tell" and the caller sends the whole sitemap. Treating a failed diff
 * as an empty one would silently stop every announcement.
 *
 * Two-dot (`base HEAD`), not three-dot: it compares the two trees and needs no shared history,
 * which matters because the deploy job's checkout is shallow (depth 1). A `before` commit that
 * is missing is fetched on its own, depth 1 — the repository is public, so that needs no token
 * (the checkout holds none: `persist-credentials: false`). `--no-renames` lists the old name of
 * a moved page too, so a page that moved is announced at both addresses.
 *
 * @param {string} base
 * @param {{ cwd?: string, fetchMissing?: boolean }} [options]
 * @returns {string[] | null}
 */
export function gitChangedFiles(base, { cwd, fetchMissing = true } = {}) {
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const diff = () =>
    git('diff', '--name-only', '--no-renames', base, 'HEAD').split('\n').filter(Boolean)
  try {
    return diff()
  } catch {
    if (!fetchMissing) return null
  }
  try {
    git('fetch', '--no-tags', '--depth=1', 'origin', base)
    return diff()
  } catch {
    return null
  }
}

/**
 * What to submit.
 *
 * - `changed`: a known diff touched public pages → exactly those paths.
 * - `none`: a known diff touched none → send nothing.
 * - `all`: no trustworthy diff → the whole sitemap, as before this module existed.
 *
 * ⚠️ WHY THE FALLBACK IS "ALL" AND NOT "NOTHING". A hand-run workflow, a first push, a
 * force-push that dropped the `before` commit, or a failed git call all leave us unable to say
 * what changed. Sending nothing there would be a silent, permanent miss; sending the sitemap
 * is the behaviour every deploy had until 2026-10-07 and costs one extra submission, and a
 * person who runs the workflow by hand usually wants exactly that.
 *
 * @param {{ eventName?: string, before?: string }} event
 * @param {(base: string) => string[] | null} changedSince
 * @returns {{ mode: 'changed' | 'none' | 'all', paths: string[] }}
 */
export function indexNowSelection(event, changedSince) {
  const base = baseFor(event)
  if (base === null) return { mode: 'all', paths: [] }
  const files = changedSince(base)
  if (files === null) return { mode: 'all', paths: [] }
  const paths = pathsForChangedFiles(files)
  return paths.length === 0 ? { mode: 'none', paths } : { mode: 'changed', paths }
}
