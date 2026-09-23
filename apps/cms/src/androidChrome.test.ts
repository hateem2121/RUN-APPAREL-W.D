import { describe, expect, it } from 'vitest'
import {
  ANDROID_CAVEAT,
  chromeMajorVersion,
  DEFAULT_ANDROID_PACKAGE,
  describeHost,
  FONT_CHECK_SCRIPT,
  fontCheckPassed,
  HOST_LOOPBACK_ALIAS,
  parseChromeVersionName,
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

describe('parseChromeVersionName — reading adb shell dumpsys package output', () => {
  // ⚠️ This fixture is a REPRESENTATIVE shape of `dumpsys package <pkg>` output (stable
  // across Android releases for over a decade), not one captured from a real device —
  // unlike ios-safari.test.ts's fixtures, this Mac has no Android SDK to capture a real
  // one from. Flagged here rather than passed off as measured.
  const REPRESENTATIVE_DUMPSYS = `
Packages:
  Package [com.android.chrome] (a1b2c3d):
    userId=10123
    pkg=Package{a1b2c3d com.android.chrome}
    codePath=/product/app/Chrome
    versionCode=629400610 minSdk=24 targetSdk=34
    versionName=129.0.6668.100
    splits=[base]
    apkSigningVersion=3
`

  it('extracts the versionName from a realistic dumpsys block', () => {
    expect(parseChromeVersionName(REPRESENTATIVE_DUMPSYS)).toBe('129.0.6668.100')
  })

  it('throws a named, actionable error when there is no versionName line — negative control', () => {
    // Proves the function distinguishes "found" from "not found" rather than always
    // succeeding: a block with real dumpsys shape but no versionName line (e.g. the
    // package genuinely is not installed on this AVD image) must still throw.
    const packageBlockWithNoVersion =
      'Packages:\n  Package [com.android.chrome] (a1b2c3d):\n    userId=10123\n    apkSigningVersion=3\n'
    expect(() => parseChromeVersionName(packageBlockWithNoVersion)).toThrow(
      /is com.android.chrome installed/,
    )
    expect(() => parseChromeVersionName('')).toThrow(/is com.android.chrome installed/)
    expect(() => parseChromeVersionName(undefined as unknown as string)).toThrow(
      /is com.android.chrome installed/,
    )
  })
})

describe('chromeMajorVersion', () => {
  it('reads the major version off a full version string', () => {
    expect(chromeMajorVersion('129.0.6668.100')).toBe(129)
  })

  it('handles an older-shaped version the same way — negative control for a hardcoded parse', () => {
    expect(chromeMajorVersion('94.0.4606.71')).toBe(94)
  })

  it('throws rather than returning NaN on a bad parse', () => {
    expect(() => chromeMajorVersion('not-a-version')).toThrow(/does not look like a Chrome version/)
    expect(() => chromeMajorVersion('')).toThrow(/does not look like a Chrome version/)
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
