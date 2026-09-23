import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  containsGarmentName,
  DEFAULT_GARMENT_NAME,
  DEFAULT_TARGET_URL,
  DISABLE_SPEAK_INSTRUCTIONS_SETTINGS,
  formatCheckLine,
  importFromDepsDir,
  isAnnouncedSelected,
  isHeadingLevel1Announcement,
  isTabAnnouncement,
  resolveEsmEntry,
  resolveRuntimeDepsDir,
  VOICEOVER_CAVEAT,
  VOICEOVER_HONESTY_LABEL,
  WEBKIT_APPLICATION_NAME,
} from '../../../scripts/voiceover.mjs'

/**
 * The pure half of the macOS VoiceOver harness.
 *
 * Only the decisions are tested here: how a package's real ESM entry is resolved, how a
 * VoiceOver item's text is read as "a level-1 heading", "a tab", or "selected", and how a
 * PASS/FAIL line is formatted. `navigateToWebContent`, `runChecks` and `main` all drive a
 * real `voiceOver` singleton and a real Playwright `page` — matching the exemption
 * `apps/cms/src/androidChrome.test.ts` and `apps/cms/src/iosSafari.test.ts` already make
 * for their own session functions, nothing here mocks a fetch/AppleScript call and
 * declares victory; the real session is exercised by actually driving VoiceOver, in CI
 * (see `.github/workflows/voiceover.yml`). This Mac cannot start VoiceOver at all
 * (`scripts/voiceover.mjs`'s own header explains why), so that exemption is not a choice
 * of convenience here — it is the only thing that can be tested locally.
 *
 * `importFromDepsDir` is the one exception worth calling out: it is exercised for REAL
 * below, against small fixture packages written to a temp directory, rather than treated
 * as untestable. It imports no Guidepup or Playwright code to do so — the whole point of
 * the function is generic dynamic-import plumbing that has nothing to do with either
 * package, and it is also the newest, least-precedented mechanism in this module (a
 * `NODE_PATH` + ESM combination that was measured NOT to work is exactly the kind of trap
 * this suite exists to catch before CI does).
 */

describe('resolveEsmEntry — reading a package.json the way Node itself would', () => {
  it('prefers exports["."].import, matching playwright@1.63.0’s own shape', () => {
    // Real shape, checked against the npm registry 2026-09-23: playwright declares BOTH
    // "main" (its CommonJS entry) and an "exports" map with a DIFFERENT file for ESM
    // importers. Reading "main" alone would be wrong for a dynamic import().
    const playwrightShaped = {
      main: 'index.js',
      exports: { '.': { types: './index.d.ts', import: './index.mjs', default: './index.js' } },
    }
    expect(resolveEsmEntry(playwrightShaped)).toBe('./index.mjs')
  })

  it('falls back to exports["."].default when there is no "import" condition', () => {
    const noImportCondition = { main: 'index.js', exports: { '.': { default: './default.js' } } }
    expect(resolveEsmEntry(noImportCondition)).toBe('./default.js')
  })

  it('accepts exports["."] as a bare string', () => {
    expect(resolveEsmEntry({ main: 'index.js', exports: { '.': './only.js' } })).toBe('./only.js')
  })

  it('falls back to "main" when there is no exports map, matching @guidepup/guidepup@0.34.0', () => {
    // Real shape, checked against the npm registry 2026-09-23: no "exports" field at all.
    expect(resolveEsmEntry({ main: 'lib/index.js' })).toBe('lib/index.js')
  })

  it('falls back to "index.js" when neither exports nor main is present — negative control', () => {
    expect(resolveEsmEntry({})).toBe('index.js')
    expect(resolveEsmEntry(null)).toBe('index.js')
    expect(resolveEsmEntry(undefined)).toBe('index.js')
  })
})

describe('importFromDepsDir — the actual dynamic-import mechanism, exercised for real', () => {
  let tempDir: string | undefined

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  })

  async function writeFixturePackage(
    depsDir: string,
    name: string,
    packageJson: Record<string, unknown>,
    files: Record<string, string>,
  ) {
    const pkgDir = join(depsDir, 'node_modules', name)
    await mkdir(pkgDir, { recursive: true })
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify(packageJson), 'utf8')
    for (const [relativePath, contents] of Object.entries(files)) {
      await writeFile(join(pkgDir, relativePath), contents, 'utf8')
    }
  }

  it('imports a CJS package (main only) by its real entry file, default-unwrapped', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voiceover-deps-'))
    await writeFixturePackage(
      tempDir,
      'fixture-cjs',
      { name: 'fixture-cjs', main: 'index.cjs' },
      {
        'index.cjs': 'exports.hello = () => "hi from fixture-cjs"',
      },
    )

    const mod = await importFromDepsDir(tempDir, 'fixture-cjs')

    expect(mod.hello()).toBe('hi from fixture-cjs')
  })

  it('imports a package via exports["."].import, not "main" — the playwright shape', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voiceover-deps-'))
    await writeFixturePackage(
      tempDir,
      'fixture-esm',
      {
        name: 'fixture-esm',
        main: 'wrong-entry.cjs',
        exports: { '.': { import: './right-entry.mjs', default: './wrong-entry.cjs' } },
      },
      {
        'wrong-entry.cjs':
          'exports.hello = () => "WRONG — this is the CJS fallback, not the ESM entry"',
        'right-entry.mjs': 'export const hello = () => "hi from the real ESM entry"',
      },
    )

    const mod = await importFromDepsDir(tempDir, 'fixture-esm')

    // Negative control folded in: if this ever read "main" instead of the ESM condition,
    // it would get the wrong string back rather than throwing, so the assertion has to
    // check the VALUE, not just that something was returned.
    expect(mod.hello()).toBe('hi from the real ESM entry')
  })

  it('resolves a scoped package name into its nested node_modules directory', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voiceover-deps-'))
    await writeFixturePackage(
      tempDir,
      '@fixture-scope/pkg',
      { name: '@fixture-scope/pkg', main: 'i.cjs' },
      {
        'i.cjs': 'exports.hello = () => "hi from a scoped fixture"',
      },
    )

    const mod = await importFromDepsDir(tempDir, '@fixture-scope/pkg')

    expect(mod.hello()).toBe('hi from a scoped fixture')
  })

  it('lets a package’s own transitive dependency resolve via the shared node_modules', async () => {
    // Mirrors how npm actually lays out `npm install --prefix X pkgA pkgB`: every
    // installed package sits as a SIBLING under one node_modules, so pkgA's own
    // `require('pkgB')` resolves by walking up from pkgA's own directory. This is the
    // exact shape @guidepup/guidepup's real dependencies (debug, plist) rely on.
    tempDir = await mkdtemp(join(tmpdir(), 'voiceover-deps-'))
    await writeFixturePackage(
      tempDir,
      'fixture-dep',
      { name: 'fixture-dep', main: 'd.cjs' },
      {
        'd.cjs': 'exports.helper = () => "dep-value"',
      },
    )
    await writeFixturePackage(
      tempDir,
      'fixture-with-dep',
      { name: 'fixture-with-dep', main: 'i.cjs' },
      {
        'i.cjs':
          'const { helper } = require("fixture-dep"); exports.hello = () => "combined: " + helper()',
      },
    )

    const mod = await importFromDepsDir(tempDir, 'fixture-with-dep')

    expect(mod.hello()).toBe('combined: dep-value')
  })

  it('throws rather than silently resolving nothing when the package is missing — negative control', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voiceover-deps-'))

    await expect(importFromDepsDir(tempDir, 'never-installed')).rejects.toThrow()
  })
})

describe('resolveRuntimeDepsDir — the one thing this module cannot check for itself', () => {
  it('reads GUIDEPUP_DEPS_DIR from the given environment', () => {
    expect(resolveRuntimeDepsDir({ GUIDEPUP_DEPS_DIR: '/tmp/example' })).toBe('/tmp/example')
  })

  it('throws a named, actionable error when unset — negative control', () => {
    expect(() => resolveRuntimeDepsDir({})).toThrow(/GUIDEPUP_DEPS_DIR is not set/)
  })
})

describe('isHeadingLevel1Announcement', () => {
  it('matches the shape @guidepup/playwright’s own README example shows for a heading', () => {
    // "Guidepup heading level 1" — verbatim from guidepup-playwright's README (0.19.1,
    // fetched 2026-09-23). Tolerant of an optional comma, which that one example does not
    // settle either way.
    expect(isHeadingLevel1Announcement('Guidepup heading level 1')).toBe(true)
    expect(isHeadingLevel1Announcement('Velocity Performance Tee, heading level 1')).toBe(true)
    expect(isHeadingLevel1Announcement('HEADING LEVEL 1')).toBe(true)
    // Verbatim `lastSpokenPhrase()` on the first real CI run (macos-26, 2026-09-23):
    // VoiceOver SPEAKS the role first, where the caption API puts it last.
    expect(isHeadingLevel1Announcement('heading level 1 velocity PERFORMANCE TEE 2 items')).toBe(
      true,
    )
  })

  it('does not match a different heading level or an unrelated item — negative control', () => {
    expect(isHeadingLevel1Announcement('Velocity Performance Tee, heading level 2')).toBe(false)
    expect(isHeadingLevel1Announcement('heading level 10')).toBe(false)
    expect(isHeadingLevel1Announcement('Wine, tab, 1 of 5')).toBe(false)
    expect(isHeadingLevel1Announcement('')).toBe(false)
    expect(isHeadingLevel1Announcement(undefined)).toBe(false)
    expect(isHeadingLevel1Announcement(null)).toBe(false)
  })
})

describe('containsGarmentName', () => {
  it('matches case-insensitively, including the lowercased first-word accent', () => {
    // headingWithAccent(text, 'first') (apps/viewer/src/components/SerifAccent.tsx)
    // lowercases the product name's first word in the actual DOM text, by design — so an
    // exact-case check would be wrong on the real page, not just overly strict.
    expect(
      containsGarmentName('velocity Performance Tee, heading level 1', 'Velocity Performance'),
    ).toBe(true)
    expect(containsGarmentName('VELOCITY PERFORMANCE TEE', 'velocity performance')).toBe(true)
  })

  it('does not match unrelated text — negative control', () => {
    expect(containsGarmentName('Sample Without Model', 'Velocity Performance')).toBe(false)
    expect(containsGarmentName(undefined, 'Velocity Performance')).toBe(false)
  })

  it('matches the SPOKEN phrase measured on the first real CI run, and any separator between the words', () => {
    // Verbatim `lastSpokenPhrase()` for the fixture's product heading, macos-26 runner,
    // 2026-09-23 — the words a person actually hears.
    expect(
      containsGarmentName(
        'heading level 1 velocity PERFORMANCE TEE 2 items',
        'Velocity Performance',
      ),
    ).toBe(true)
    // A pause VoiceOver renders as punctuation, or a run of spaces, is still a separator.
    expect(containsGarmentName('velocity, PERFORMANCE TEE', 'Velocity Performance')).toBe(true)
    expect(containsGarmentName('velocity   PERFORMANCE TEE', 'Velocity Performance')).toBe(true)
  })

  it('FAILS when the words are run together — the real fault this check exists to catch — negative control', () => {
    // The same run's `itemText()` joined the two text runs of the heading with no space
    // ("velocityPERFORMANCE TEE"). If the SPOKEN phrase ever did that, a VoiceOver user
    // would hear one invented word, so the comparison must collapse separators, never
    // strip them: stripping would pass this line and hide the fault.
    expect(
      containsGarmentName('heading level 1 velocityPERFORMANCE TEE', 'Velocity Performance'),
    ).toBe(false)
    expect(containsGarmentName('velocityperformance tee', 'Velocity Performance')).toBe(false)
  })
})

describe('isTabAnnouncement', () => {
  it('matches a real ARIA role="tab" announcement', () => {
    expect(isTabAnnouncement('Wine, tab, 1 of 5')).toBe(true)
    expect(isTabAnnouncement('Blush, tab, selected, 2 of 5')).toBe(true)
  })

  it('does not match a word that merely contains "tab" — negative control', () => {
    // ColourwayTabs.tsx renders role="tab"; it must not be confused with plain prose that
    // happens to share three letters.
    expect(isTabAnnouncement('tablet')).toBe(false)
    expect(isTabAnnouncement('tabular data')).toBe(false)
    expect(isTabAnnouncement('')).toBe(false)
    expect(isTabAnnouncement(undefined)).toBe(false)
  })

  it('does not count the TABLIST itself ("tab group") as a tab — negative control', () => {
    // ColourwayTabs.tsx's container is role="tablist", which VoiceOver names "tab group".
    // Counted as a tab it would stand in for a second, not-selected tab.
    expect(isTabAnnouncement('Select colorway, tab group')).toBe(false)
    expect(isTabAnnouncement('Select colorway tab group')).toBe(false)
  })

  it('still counts a real tab whose phrase also names the group it sits in', () => {
    expect(isTabAnnouncement('Wine, selected, tab, 1 of 5, Select colorway, tab group')).toBe(true)
  })

  it('does not count the TABPANEL ("tab panel") as a tab — negative control', () => {
    // MEASURED on run 35880390762: the stage is role="tabpanel", read BEFORE the tablist,
    // and VoiceOver spoke both its start and its end. Counted as tabs, those two phrases
    // stood in for "not-selected tabs", so one real tab plus its panel would have passed.
    expect(isTabAnnouncement('Wine tab panel')).toBe(false)
    expect(isTabAnnouncement('end of Wine tab panel')).toBe(false)
  })

  it('counts the real tabs exactly as that run spoke them', () => {
    expect(isTabAnnouncement('Wine selected tab, 1 of 5')).toBe(true)
    expect(isTabAnnouncement('Pebble / Optic White tab, 2 of 5')).toBe(true)
    expect(isTabAnnouncement('Butter tab, 3 of 5')).toBe(true)
  })
})

describe('isAnnouncedSelected', () => {
  it('matches an item announced as selected', () => {
    expect(isAnnouncedSelected('Wine, tab, selected, 1 of 5')).toBe(true)
  })

  it('does not match an item with no mention of "selected" at all — negative control', () => {
    // ColourwayTabs.tsx sets aria-selected={colourway.slug === selected.slug} — a boolean
    // present on EVERY tab — and the standard, documented convention for aria-selected on
    // a tab (unlike aria-checked on a checkbox) is to speak "selected" only when true and
    // add nothing when false. This is the asymmetry check (b) in runChecks() relies on.
    expect(isAnnouncedSelected('Blush, tab, 2 of 5')).toBe(false)
    expect(isAnnouncedSelected('')).toBe(false)
    expect(isAnnouncedSelected(undefined)).toBe(false)
  })

  it('reads "not selected" and "unselected" as NOT selected — negative control', () => {
    // The convention is silence for a tab that is not selected, but a phrase that says so
    // outright must not be counted as the current tab.
    expect(isAnnouncedSelected('Blush, tab, not selected, 2 of 5')).toBe(false)
    expect(isAnnouncedSelected('Blush, tab, unselected, 2 of 5')).toBe(false)
  })
})

describe('formatCheckLine', () => {
  it('carries the honesty label and PASS on a passing check', () => {
    const line = formatCheckLine({ pass: true, name: 'example check', message: 'it worked' })
    expect(line).toContain('PASS')
    expect(line).toContain(VOICEOVER_HONESTY_LABEL)
    expect(line).toContain('example check')
    expect(line).toContain('it worked')
  })

  it('carries the honesty label and FAIL on a failing check — negative control', () => {
    const line = formatCheckLine({ pass: false, name: 'example check', message: 'it did not' })
    expect(line).toContain('FAIL')
    expect(line).not.toContain('PASS (')
    expect(line).toContain(VOICEOVER_HONESTY_LABEL)
  })
})

describe('constants — drift guards for values other parts of this system must agree with', () => {
  it('the caveat names both the runner and what it does not cover', () => {
    expect(VOICEOVER_CAVEAT).toMatch(/macos 26/i)
    expect(VOICEOVER_CAVEAT).toMatch(/never replaces/i)
    expect(VOICEOVER_CAVEAT).toMatch(/iPhone VoiceOver gestures are not covered/i)
  })

  it('the short label on every PASS/FAIL line carries all three required parts, not just the runner', () => {
    // An earlier assertion here checked only /voiceover/i and /macos 26/i — both of
    // which the OLD, too-short label ("real VoiceOver, GitHub macOS 26 runner", no more)
    // also satisfied, so it could not have caught that gap. "VoiceOver" names the SAME
    // screen reader on macOS and iPhone, so a line naming only the runner reads, out of
    // context, as though it said something about iPhone coverage — which this robot does
    // not have. The robot's honesty rule — every result line says what ran it, that it
    // approximates and never replaces a person, and that iPhone gestures are not covered —
    // is pinned individually below, not just the word "voiceover".
    expect(VOICEOVER_HONESTY_LABEL).toMatch(/real voiceover/i)
    expect(VOICEOVER_HONESTY_LABEL).toMatch(/macos 26/i)
    expect(VOICEOVER_HONESTY_LABEL).toMatch(/never replaces/i)
    expect(VOICEOVER_HONESTY_LABEL).toMatch(/iphone voiceover gestures.{0,15}not covered/i)
  })

  it('the strengthened label test can actually fail on the old, too-short label — negative control', () => {
    // The exact string this constant carried before it was lengthened. Proves the four
    // assertions above are not vacuous: the old label passes the first two (which is
    // exactly why they were not enough) and fails the last two.
    const OLD_TOO_SHORT_LABEL = 'real VoiceOver, GitHub macOS 26 runner — approximates a person'
    expect(OLD_TOO_SHORT_LABEL).toMatch(/real voiceover/i)
    expect(OLD_TOO_SHORT_LABEL).toMatch(/macos 26/i)
    expect(OLD_TOO_SHORT_LABEL).not.toMatch(/never replaces/i)
    expect(OLD_TOO_SHORT_LABEL).not.toMatch(/iphone voiceover gestures.{0,15}not covered/i)
  })

  it('the default target is the e2e fixture product', () => {
    expect(DEFAULT_TARGET_URL).toBe('http://127.0.0.1:4173/n001/wine')
    expect(DEFAULT_GARMENT_NAME).toBe('Velocity Performance')
  })

  it('the webkit application name matches guidepup-playwright’s own applicationNameMap', () => {
    // { webkit: "Playwright" } — read directly from that file at the pinned 0.19.1 tag.
    expect(WEBKIT_APPLICATION_NAME).toBe('Playwright')
  })

  it('the verbosity setting matches the exact key the maintainer documented in issue #82', () => {
    expect(DISABLE_SPEAK_INSTRUCTIONS_SETTINGS).toEqual({ SCRShouldOutputVOInstructions: false })
  })
})
