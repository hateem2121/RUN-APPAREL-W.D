import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ANDROID_CAVEAT,
  DEFAULT_ANDROID_PACKAGE,
  describeHost,
  FONT_CHECK_SCRIPT,
  fontCheckPassed,
  HOST_LOOPBACK_ALIAS,
  readSessionId,
  sessionBody,
} from '../../../scripts/android-chrome.mjs'

/**
 * The pure half of the Android Chrome harness.
 *
 * Only the decisions are tested here: what capabilities get sent, how a reply is read,
 * how a host is labelled, how `dumpsys` output is parsed, and what counts as a passing
 * font check. The session functions (`startDriver`, `openSession`, `go`, `evaluate`,
 * `closeSession`) talk to `chromedriver` over HTTP and are exercised by actually driving
 * an emulator in CI — a mocked `fetch` would assert that this file calls the endpoints
 * this file names, which is the shape of test the root CLAUDE.md warns about: nothing
 * that happens in production could make it fail. Same exemption and same reasoning as
 * `iosSafari.test.ts`: nothing counts `scripts/` in coverage, so every function below is
 * shown catching its fault AND passing clean input.
 */

describe('sessionBody — what tells chromedriver to drive Android, not a local binary', () => {
  it('always sends androidPackage, defaulting to real Chrome', () => {
    // Without this, chromedriver looks for a Chrome binary ON THE RUNNER — there is
    // none — and fails with an unrelated "cannot find Chrome binary" error that reads
    // as a broken CI image rather than a missing capability.
    const body = sessionBody()
    expect(body.capabilities.alwaysMatch['goog:chromeOptions']).toMatchObject({
      androidPackage: 'com.android.chrome',
    })
    expect(DEFAULT_ANDROID_PACKAGE).toBe('com.android.chrome')
  })

  it('omits androidDeviceSerial when none is given — negative control for the next test', () => {
    const options = sessionBody().capabilities.alwaysMatch['goog:chromeOptions'] as Record<
      string,
      unknown
    >
    expect(options.androidDeviceSerial).toBeUndefined()
  })

  it('pins one attached device when given a serial', () => {
    const options = sessionBody({ androidDeviceSerial: 'emulator-5554' }).capabilities.alwaysMatch[
      'goog:chromeOptions'
    ] as Record<string, unknown>
    expect(options.androidDeviceSerial).toBe('emulator-5554')
    expect(options.androidPackage).toBe('com.android.chrome')
  })

  it('honours an explicit package — negative control for the default', () => {
    const options = sessionBody({ androidPackage: 'com.chrome.beta' }).capabilities.alwaysMatch[
      'goog:chromeOptions'
    ] as Record<string, unknown>
    expect(options.androidPackage).toBe('com.chrome.beta')
  })
})

describe('readSessionId', () => {
  it('returns the id from a real reply', () => {
    // Shape a W3C-compliant `POST /session` success response takes for any driver —
    // the same shape ios-safari.mjs's own test fixture uses, since both are the same
    // wire protocol.
    expect(
      readSessionId({
        value: {
          sessionId: 'A1B2C3D4-0000-0000-0000-000000000000',
          capabilities: { platformName: 'android', browserVersion: '129.0.6668.100' },
        },
      }),
    ).toBe('A1B2C3D4-0000-0000-0000-000000000000')
  })

  it('surfaces chromedriver’s own message rather than a fabricated one', () => {
    // Deliberately generic (see the comment on readSessionId): this module has no
    // locally-measured real failure to pattern-match, unlike ios-safari.mjs's iOS 27
    // detector. The test only pins that the REAL message survives verbatim.
    expect(() =>
      readSessionId({ value: { message: 'unknown error: cannot find Chrome binary' } }),
    ).toThrow(/cannot find Chrome binary/)
  })

  it('adds generic troubleshooting guidance without inventing a specific diagnosis', () => {
    try {
      readSessionId({ value: { message: 'some chromedriver failure' } })
      throw new Error('expected readSessionId to throw')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('some chromedriver failure')
      expect(message).toMatch(/adb has no booted device/)
    }
  })

  it('does not pretend an empty reply succeeded', () => {
    expect(() => readSessionId({})).toThrow(/no sessionId/)
    expect(() => readSessionId(null)).toThrow(/no sessionId/)
  })
})

describe('describeHost — a report must name what it measured', () => {
  it('labels a real capability set, and says emulator out loud', () => {
    expect(describeHost({ platformName: 'android', browserVersion: '129.0.6668.100' })).toBe(
      'android · Chrome 129.0.6668.100 (emulator)',
    )
  })

  it('never silently invents a version when the fields are missing', () => {
    expect(describeHost({})).toBe('android · Chrome unknown version (emulator)')
    expect(describeHost(undefined)).toContain('(emulator)')
  })
})

describe('ANDROID_CAVEAT', () => {
  it('names what is trustworthy and what is not, and says "emulator" out loud', () => {
    expect(ANDROID_CAVEAT).toMatch(/real Chrome for Android/)
    expect(ANDROID_CAVEAT).toMatch(/NOT device numbers/)
    expect(ANDROID_CAVEAT).toContain('emulator (approximates hardware)')
  })
})

describe('HOST_LOOPBACK_ALIAS — the trap this module exists partly to avoid', () => {
  it('is the QEMU host-loopback alias, never "localhost"', () => {
    // A fixture server addressed as "localhost" from inside the emulator would reach the
    // EMULATED DEVICE's own loopback, not the runner that started the server — see the
    // header comment. Pinning the literal here means a typo'd URL fails this test rather
    // than failing silently as "the site is down" in a real CI run.
    expect(HOST_LOOPBACK_ALIAS).toBe('10.0.2.2')
    expect(HOST_LOOPBACK_ALIAS).not.toBe('localhost')
    expect(HOST_LOOPBACK_ALIAS).not.toBe('127.0.0.1')
  })
})

describe('fontCheckPassed — the two halves must agree with FONT_CHECK_SCRIPT', () => {
  it('requires BOTH the CSS stack and document.fonts to agree — neither alone is enough', () => {
    // Positive control.
    expect(
      fontCheckPassed({
        fontFamily: '"Archivo Variable", Archivo, system-ui, sans-serif',
        archivoLoaded: true,
      }),
    ).toBe(true)

    // The CSS rule can cascade correctly while the font FILE silently 404s — the browser
    // falls through to the next family in the stack but getComputedStyle keeps reporting
    // the AUTHORED value regardless. This is why fontFamily alone is not a real test: it
    // would pass even while the actual webfont never loaded.
    expect(
      fontCheckPassed({
        fontFamily: '"Archivo Variable", Archivo, system-ui, sans-serif',
        archivoLoaded: false,
      }),
    ).toBe(false)

    // The reverse: some OTHER Archivo-named face loaded (e.g. a leftover from a previous
    // page) while the actual CSS rule on this page no longer names it — a regression in
    // the stylesheet itself, which archivoLoaded alone would miss.
    expect(
      fontCheckPassed({
        fontFamily: 'system-ui, sans-serif',
        archivoLoaded: true,
      }),
    ).toBe(false)
  })

  it('fails closed on a missing or malformed result, never throws', () => {
    expect(fontCheckPassed(null)).toBe(false)
    expect(fontCheckPassed(undefined)).toBe(false)
    expect(fontCheckPassed({})).toBe(false)
    // A malformed value straight off the wire (chromedriver's JSON, not TypeScript) —
    // cast past the compile-time type deliberately, the same way the "does not pretend
    // an empty reply succeeded" tests above pass `null`/`{}` where a real object is typed.
    expect(fontCheckPassed({ fontFamily: 42, archivoLoaded: true } as never)).toBe(false)
  })

  it('the script run in the browser returns exactly the keys fontCheckPassed reads (drift guard)', () => {
    // FONT_CHECK_SCRIPT runs inside the emulator's Chrome; fontCheckPassed runs in Node
    // and is unit tested here. Nothing else would catch the two drifting apart — the same
    // class of bug this repo's CLAUDE.md calls out for isMediaReferenced vs
    // find-orphan-media.mjs and heartbeat.yml's WATCHED list. So the returned object's
    // shape is read directly off the script source rather than assumed.
    expect(FONT_CHECK_SCRIPT).toContain('fontFamily:')
    expect(FONT_CHECK_SCRIPT).toContain('archivoLoaded:')
    expect(FONT_CHECK_SCRIPT).toContain('getComputedStyle(document.body)')
    expect(FONT_CHECK_SCRIPT).toContain("f.status === 'loaded'")

    // A result carrying exactly those two keys, with values FONT_CHECK_SCRIPT could
    // plausibly produce, must be readable by fontCheckPassed.
    const plausibleResult = { fontFamily: 'Archivo Variable, sans-serif', archivoLoaded: true }
    expect(fontCheckPassed(plausibleResult)).toBe(true)

    // ⚠️ Negative control proving this check can actually fail: a result shaped with the
    // WRONG key name (as if FONT_CHECK_SCRIPT and fontCheckPassed had drifted apart) must
    // be read as a failure, never silently ignored.
    const driftedResult = { fontFamilyName: 'Archivo Variable, sans-serif', loaded: true }
    expect(fontCheckPassed(driftedResult as never)).toBe(false)
  })
})

/**
 * `android-chrome.yml`'s viewer build must never bake in the production API.
 *
 * The workflow's own target today is a bare `/` (scripts/android-chrome.mjs), which
 * calls no CMS endpoint — but apps/viewer/src/lib/api.ts falls back to the production
 * API (https://cms.wear-run.help) whenever VITE_API_BASE_URL is unset, exactly the gap
 * apps/viewer/e2e/prepare.mjs blanks it to avoid, and apps/viewer/CLAUDE.md pins the
 * same rule for anyone driving a built copy by hand. Nothing exercises this today,
 * which is precisely why a future product-route check added to this robot could start
 * silently sending CI traffic at production with no test noticing — the
 * fixtures-cannot-exhibit-the-failure shape the root CLAUDE.md warns about.
 *
 * WHY LINE-BASED, NOT A YAML PARSER: same reasoning as workflowHardening.test.ts's own
 * header comment — no workspace here depends on a YAML library. This walks backward
 * from the build command to its own step's opening line, the same step-boundary shape
 * that file's persist-credentials rule walks forward across.
 */
describe('android-chrome.yml — viewer build stays off the production API', () => {
  const WORKFLOW_PATH = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '.github',
    'workflows',
    'android-chrome.yml',
  )

  it('sets VITE_API_BASE_URL to the empty string on the viewer build step', () => {
    const lines = readFileSync(WORKFLOW_PATH, 'utf8').split('\n')

    const runLineIndex = lines.findIndex((l) =>
      /^\s*(?:- )?run:\s*pnpm\s+--filter\s+@run-apparel\/viewer\s+build\s*$/.test(l),
    )
    expect(
      runLineIndex,
      'the viewer build step has moved, been renamed, or no longer matches',
    ).toBeGreaterThan(-1)

    const runLine = lines[runLineIndex]!
    const runIndent = runLine.length - runLine.trimStart().length

    // Walk back to this step's own opening line — a list item ("- ") shallower than
    // the run: line itself — collecting everything from there through the run: line.
    // Same step-boundary shape as workflowHardening.test.ts's persist-credentials
    // rule, which walks the equivalent boundary forward instead of backward.
    let stepStart = runLineIndex
    for (let i = runLineIndex; i >= 0; i--) {
      const line = lines[i]!
      if (line.trim() === '') continue
      const indent = line.length - line.trimStart().length
      if (indent < runIndent && line.trimStart().startsWith('- ')) {
        stepStart = i
        break
      }
      if (indent < runIndent) break
    }

    const stepText = lines.slice(stepStart, runLineIndex + 1).join('\n')
    expect(
      stepText,
      'The Android viewer build must set VITE_API_BASE_URL to the empty string — left ' +
        'unset it defaults to the production API in apps/viewer/src/lib/api.ts, exactly ' +
        'what apps/viewer/e2e/prepare.mjs blanks it to avoid.',
    ).toMatch(/VITE_API_BASE_URL:\s*(['"])\1/)
  })
})
