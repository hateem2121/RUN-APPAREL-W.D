import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CO-13: one shared token file, not a per-app copy that can silently diverge.
 *
 * Measured live 2026-09-23 (this batch's own re-check): the `:root` token block served
 * by `viewer.wear-run.help` and `wear-run.help` is BYTE-IDENTICAL, diffed directly. That
 * is not a coincidence to re-measure every time — it is architecturally guaranteed by
 * both entry points importing the exact same `@run-apparel/ui/tokens.css` module rather
 * than each holding its own copy, and this is a source-text check of that guarantee, not
 * a build check: confirming a future per-app copy would show up here, at the import
 * statement, before it ever reached a live bundle diff.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const VIEWER_ENTRY = join(REPO_ROOT, 'apps', 'viewer', 'src', 'main.tsx')
const CMS_ENTRY = join(REPO_ROOT, 'apps', 'cms', 'src', 'app', '(frontend)', 'layout.tsx')
const TOKENS_CSS = join(REPO_ROOT, 'packages', 'ui', 'src', 'tokens.css')

/** The one import specifier both entry points must use — never a relative path to a
 * per-app copy, which is exactly the failure mode this test exists to catch. */
const SHARED_IMPORT = "'@run-apparel/ui/tokens.css'"

describe('CO-13 — the viewer and the site import the same tokens.css', () => {
  it('both entry points import the shared package path, not a local copy', () => {
    const viewerSource = readFileSync(VIEWER_ENTRY, 'utf8')
    const cmsSource = readFileSync(CMS_ENTRY, 'utf8')

    expect(
      viewerSource.includes(SHARED_IMPORT),
      `apps/viewer/src/main.tsx no longer imports ${SHARED_IMPORT} — if it now imports a ` +
        'local copy of the tokens instead, the two apps can drift silently, which is the ' +
        'defect a byte-identical live diff would otherwise have to catch after the fact',
    ).toBe(true)
    expect(
      cmsSource.includes(SHARED_IMPORT),
      "apps/cms/src/app/(frontend)/layout.tsx no longer imports the shared tokens.css",
    ).toBe(true)
  })

  it('a representative sample of tokens is present with a non-empty value', () => {
    const css = readFileSync(TOKENS_CSS, 'utf8')
    const declarations = new Map<string, string>()
    for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      const [, name, value] = match
      if (name) declarations.set(name, (value ?? '').trim())
    }

    // At minimum, per this task: --ink, --paper, --volt, every --radius-*, every --text-*.
    const radiusNames = [...declarations.keys()].filter((name) => name.startsWith('--radius-'))
    const textNames = [...declarations.keys()].filter((name) => name.startsWith('--text-'))
    const required = ['--ink', '--paper', '--volt', ...radiusNames, ...textNames]

    // The control: a probe that found zero radius or text tokens would let every other
    // assertion here pass vacuously — the sample would just be --ink/--paper/--volt.
    expect(radiusNames.length, 'no --radius-* token was found at all').toBeGreaterThan(0)
    expect(textNames.length, 'no --text-* token was found at all').toBeGreaterThan(0)

    const missingOrEmpty = required.filter((name) => !declarations.get(name))
    expect(
      missingOrEmpty,
      'these tokens are missing or declared with an empty value',
    ).toEqual([])
  })
})
