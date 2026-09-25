import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalHrefs } from '../../../scripts/canonical-tags.mjs'

/**
 * FI-02 — the counter both canonical checks rely on (`scripts/smoke-viewer-preview.mjs`
 * against the live viewer, `e2e/findability.spec.ts` against the site). A counter that
 * cannot tell a comment from a tag either invents the duplicate the audit reported or
 * misses a real one, so both directions are pinned here against the REAL viewer shell.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const viewerShell = readFileSync(join(REPO_ROOT, 'apps', 'viewer', 'index.html'), 'utf8')
const URL_ = 'https://viewer.wear-run.help/rxps/wine'
/** What the Worker's `applyPreview` appends to <head> for a crawler (apps/viewer/worker/index.ts). */
const appended = `<meta property="og:url" content="${URL_}" /><link rel="canonical" href="${URL_}" />`
const crawlerResponse = viewerShell.replace('</head>', `${appended}</head>`)

describe('FI-02 — canonical tags are counted as a crawler sees them', () => {
  it('the viewer shell mentions a canonical only inside a comment (the control)', () => {
    // The raw text DOES contain the string — this is what the audit counted.
    expect(viewerShell).toMatch(/<link rel="canonical">/)
    expect(canonicalHrefs(viewerShell)).toEqual([])
  })

  it('the crawler response carries exactly one canonical, pointing at the page itself', () => {
    expect(canonicalHrefs(crawlerResponse)).toEqual([URL_])
  })

  it('a real second tag — or an empty one — is counted, not hidden', () => {
    const doubled = crawlerResponse.replace('</head>', '<link rel="canonical" href=""></head>')
    expect(canonicalHrefs(doubled)).toEqual([URL_, ''])
    expect(canonicalHrefs(`<link href='${URL_}' rel='canonical'>`)).toEqual([URL_])
  })

  it('a comment that splices into a new one when removed is still removed', () => {
    expect(canonicalHrefs('<!<!-- x -->-- <link rel="canonical" href="/a"> -->')).toEqual([])
  })
})
