/**
 * Drive REAL Chrome for Android on an Android Emulator, over W3C WebDriver, via
 * ChromeDriver's `androidPackage` capability.
 *
 * WHY THIS EXISTS. Phase 0.2 of the 100/100 plan asked for "a pretend Android phone
 * (emulator with Chrome on Linux runners with KVM)" alongside the iPhone Safari driver
 * (`scripts/ios-safari.mjs`). The iPhone half shipped in `56d38b9`; this half was never
 * built — `git grep` for `androidPackage|android-emulator-runner` returned nothing until
 * now. This module is the Android half of the same device lab.
 *
 * ⚠️ THIS IS AN EMULATOR, AND EVERY RESULT MUST SAY SO. An Android Emulator on a
 * GitHub-hosted Linux runner has no real touchscreen, no real thermal envelope and (on
 * the free `ubuntu-latest` runner) software-rendered graphics even with KVM accelerating
 * the CPU. Rendering, DOM, CSS and the accessibility tree are real Chrome for Android and
 * are trustworthy; **frame rate, scroll feel and anything time-based are NOT device
 * numbers** and must never be reported as such. `ANDROID_CAVEAT` exists to be printed
 * beside any measurement taken here, and the CLI below prints "(approximates hardware)"
 * on every PASS/FAIL line for the same reason.
 *
 * WHY ChromeDriver's `androidPackage`, NOT Playwright's Android support. Playwright's own
 * docs mark Android automation experimental; ChromeDriver's `androidPackage` capability is
 * a mature, standard part of the W3C WebDriver wire protocol (`chromeOptions.androidPackage`,
 * documented at chromedriver.chromium.org), the same maturity trade-off that picked Apple's
 * own `safaridriver` over Appium for the iPhone half. Unlike Appium, there is no extra
 * server process translating a second protocol — ChromeDriver talks W3C WebDriver on one
 * side and drives the on-device Chrome over `adb` on the other, so this module's HTTP calls
 * are byte-for-byte the same shapes as `ios-safari.mjs`'s (`/session`, `/session/:id/url`,
 * `/session/:id/execute/sync`) — only the capabilities differ.
 *
 * ⚠️ AN ANDROID EMULATOR'S "localhost" IS THE DEVICE ITSELF, NOT THE HOST RUNNER.
 * The default AVD network (QEMU user-mode networking, unchanged for over a decade) aliases
 * the HOST's loopback interface to `10.0.2.2` from inside the guest — see Android's own
 * "Set up Android Emulator networking" docs. A fixture server started on the runner and
 * addressed as `localhost` from the check script would connect to the EMULATOR's own
 * loopback and find nothing listening, which reads as "the site is down" and is actually
 * "wrong host". `HOST_LOOPBACK_ALIAS` exists so that mistake cannot happen silently.
 * This is the Android analogue of `ios-safari.mjs`'s "PIN THE FIXTURE SERVER'S PORT" trap —
 * same shape of bug (an unreachable fixture reading as a broken app), different cause.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not install `chromedriver` — that is a version-
 * matching concern against whatever Chrome build ships on the chosen AVD image, decided at
 * the workflow level (see `.github/workflows/android-chrome.yml`), not a "decision" this
 * module should hide inside a network call. It also does not boot the emulator —
 * `reactivecircus/android-emulator-runner` does that before this module's CLI ever runs.
 */

import { spawn } from 'node:child_process'

/** Print this beside any measurement taken through this module. */
export const ANDROID_CAVEAT =
  'Android Emulator on a GitHub-hosted Linux runner (KVM-accelerated CPU, software-rendered ' +
  'graphics): rendering, DOM, CSS and the accessibility tree are real Chrome for Android; ' +
  'frame rate, thermal behaviour and anything time-based are NOT device numbers. This is an ' +
  'emulator (approximates hardware), never a replacement for a real phone.'

/** The real Chrome package on every stock Android image — not Chrome Beta/Dev/Canary. */
export const DEFAULT_ANDROID_PACKAGE = 'com.android.chrome'

/**
 * QEMU's fixed alias for "the host machine's own loopback interface", from inside the
 * emulated device. Never `localhost` or `127.0.0.1` — those name the device itself.
 */
export const HOST_LOOPBACK_ALIAS = '10.0.2.2'

/**
 * The W3C `POST /session` body for ChromeDriver's Android capability.
 *
 * `androidPackage` is what tells ChromeDriver to drive a package over `adb` instead of
 * launching a local Chrome binary — without it, ChromeDriver looks for Chrome installed
 * on the RUNNER (there is none) and fails with an unrelated "cannot find Chrome binary"
 * error, which would read as a broken CI image rather than a missing capability.
 */
export function sessionBody({
  androidPackage = DEFAULT_ANDROID_PACKAGE,
  androidDeviceSerial,
} = {}) {
  const chromeOptions = { androidPackage }
  // A serial pins one attached device; without it ChromeDriver picks whichever `adb`
  // reports, which is fine here because android-emulator-runner attaches exactly one.
  if (androidDeviceSerial) chromeOptions.androidDeviceSerial = androidDeviceSerial
  return { capabilities: { alwaysMatch: { 'goog:chromeOptions': chromeOptions } } }
}

/**
 * The session id, or a thrown error carrying ChromeDriver's OWN message.
 *
 * ⚠️ Unlike `ios-safari.mjs`'s `readSessionId`, this does NOT pattern-match a specific
 * known failure string — there is no locally-measured real failure to copy the shape of
 * (this Mac has no Android SDK, and the real target is CI). Inventing a plausible-looking
 * "known error" here would be exactly the kind of unmeasured claim the root CLAUDE.md
 * warns against. So the guidance below is deliberately generic, and the real diagnosis is
 * always ChromeDriver's own `message`, printed verbatim.
 */
export function readSessionId(payload) {
  const value = payload?.value
  if (value?.sessionId) return value.sessionId
  const message = value?.message ?? 'chromedriver returned no sessionId and no message'
  throw new Error(
    `${message}\n` +
      '  → chromedriver could not start a Chrome-for-Android session. Likely causes: adb ' +
      'has no booted device attached, the androidPackage is not present on this AVD image, ' +
      'or this chromedriver build does not support the on-device Chrome version — compare ' +
      'the versions printed above this error.',
  )
}

/** "android · Chrome 129.0.6668.100 (emulator)" — for a report that names what it measured. */
export function describeHost(capabilities) {
  const platform = capabilities?.platformName ?? 'android'
  const version = capabilities?.browserVersion ?? 'unknown version'
  return `${platform} · Chrome ${version} (emulator)`
}

/**
 * Extract `versionName` from `adb shell dumpsys package <pkg>` output.
 *
 * The shape below (`versionName=X.Y.Z.W` inside a `Package [pkg] (hash):` block) has been
 * stable across Android releases for over a decade; this is documented `dumpsys` behaviour,
 * not something re-measured for this repo. Unlike `ios-safari.mjs`'s fixtures, the sample in
 * this module's test file is a REPRESENTATIVE shape, not one copied from a real run — flagged
 * there, not hidden, because this Mac has no device to capture a real one from.
 */
export function parseChromeVersionName(dumpsysOutput) {
  const match = /versionName=(\S+)/.exec(dumpsysOutput ?? '')
  if (!match?.[1]) {
    throw new Error(
      'no "versionName=" line in dumpsys output — is com.android.chrome installed on this AVD image?',
    )
  }
  return match[1]
}

/** "129.0.6668.100" -> 129. Throws rather than returning NaN, so a bad parse is loud. */
export function chromeMajorVersion(versionName) {
  const match = /^(\d+)\./.exec(versionName ?? '')
  if (!match?.[1]) {
    throw new Error(
      `"${versionName}" does not look like a Chrome version (expected e.g. "129.0.6668.100")`,
    )
  }
  return Number(match[1])
}

const json = async (url, init) => {
  const response = await fetch(url, init)
  return response.json()
}

/** Start chromedriver on `port`. Returns a handle with `.stop()`. */
export async function startDriver(port) {
  const child = spawn('chromedriver', [`--port=${port}`], { stdio: 'ignore' })
  // chromedriver has no ready signal beyond answering its status endpoint; poll instead
  // of sleeping, the same pattern ios-safari.mjs uses for safaridriver.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/status`)
      return { port, stop: () => child.kill() }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  child.kill()
  throw new Error(`chromedriver did not answer on port ${port} within 10s`)
}

/** Open a session. Returns `{ sessionId, host }`, `host` being `describeHost`'s label. */
export async function openSession(port, options = {}) {
  const payload = await json(`http://127.0.0.1:${port}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionBody(options)),
  })
  return {
    sessionId: readSessionId(payload),
    host: describeHost(payload?.value?.capabilities),
  }
}

export async function go(port, sessionId, url) {
  await json(`http://127.0.0.1:${port}/session/${sessionId}/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

/** Run `script` in the page and return its value. Write it as a function body with a return. */
export async function evaluate(port, sessionId, script, args = []) {
  const payload = await json(`http://127.0.0.1:${port}/session/${sessionId}/execute/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, args }),
  })
  return payload?.value
}

/** Always call this, even on failure — a leaked session holds the emulator's Chrome open. */
export async function closeSession(port, sessionId) {
  await fetch(`http://127.0.0.1:${port}/session/${sessionId}`, { method: 'DELETE' })
}

/**
 * The check itself: does real Chrome-for-Android resolve the bundled webfont?
 *
 * Two assertions, not one — chosen after reading this plan's own 2026-09-16 progress log,
 * which records a PROBE BUG: an earlier font-loading check used
 * `[...document.fonts].find(f => f.family === 'Archivo Variable')`, which only ever matches
 * the FIRST font subset and silently reported `archivoLoaded=false` on every real Archivo
 * load. The fix recorded there is `.some(f => f.family.includes(...) && f.status ===
 * 'loaded')`, which is what this module uses. A single check against
 * `getComputedStyle(body).fontFamily` alone would only prove the CSS RULE cascaded — that
 * string is the CSS author's intent and stays unchanged even if the font FILE 404s and the
 * browser silently falls through to the next family in the stack. Checking `document.fonts`
 * too proves the webfont actually LOADED on this device, which is the real "Android font
 * gap" question (`DECISIONS-AND-PROGRESS.md`, 2026-09-11: Android has no bundled Arial or
 * Georgia, so a `local()` fallback face behaves differently there than on Mac/iOS/Windows —
 * this check is about the PRIMARY webfont, a smaller and more foundational question than
 * that fallback-face gap, and is offered as a first check for exactly that reason).
 */
export const FONT_CHECK_SCRIPT =
  'return { fontFamily: getComputedStyle(document.body).fontFamily, ' +
  "archivoLoaded: [...document.fonts].some(f => f.family.includes('Archivo') && f.status === 'loaded') }"

/** True only when BOTH the CSS stack and the loaded-font set agree the webfont is live. */
export function fontCheckPassed(result) {
  const familyOk = typeof result?.fontFamily === 'string' && result.fontFamily.includes('Archivo')
  const loadedOk = result?.archivoLoaded === true
  return familyOk && loadedOk
}

// ─── CLI ────────────────────────────────────────────────────────────────────────────
//
// Run directly once an emulator is booted and chromedriver is on PATH:
//   node scripts/android-chrome.mjs [url]
// Defaults to the viewer e2e fixture's own default port (see apps/viewer/e2e/serve.mjs),
// addressed through HOST_LOOPBACK_ALIAS because the fixture runs on the CI RUNNER, not on
// the emulated device.

async function main() {
  const targetUrl = process.argv[2] || `http://${HOST_LOOPBACK_ALIAS}:4173/`
  const chromedriverPort = 9515 // chromedriver's own documented default.

  console.log(ANDROID_CAVEAT)
  console.log(`Target: ${targetUrl}`)

  const driver = await startDriver(chromedriverPort)
  let sessionId
  try {
    const session = await openSession(chromedriverPort, {})
    sessionId = session.sessionId
    console.log(`Driving: ${session.host}`)

    await go(chromedriverPort, sessionId, targetUrl)
    // Mirrors this repo's own established pattern for font checks (`wordmarkFit.ts` and
    // the 2026-09-16 iPhone proof both wait on `document.fonts.ready` before reading
    // anything font-related) — a read taken before the font promise settles can catch a
    // fallback face mid-swap and report it as the final state.
    await evaluate(chromedriverPort, sessionId, 'return document.fonts.ready.then(() => true)')
    const result = await evaluate(chromedriverPort, sessionId, FONT_CHECK_SCRIPT)
    console.log(`Result: ${JSON.stringify(result)}`)

    if (!fontCheckPassed(result)) {
      console.error(
        `FAIL (emulator — approximates hardware): body font-family is "${result?.fontFamily}" ` +
          `(expected it to contain "Archivo"), archivoLoaded=${result?.archivoLoaded} (expected true).`,
      )
      process.exitCode = 1
      return
    }
    console.log(
      `PASS (emulator — approximates hardware): the real webfont resolved on real Chrome for ` +
        `Android — body font-family is "${result.fontFamily}".`,
    )
  } finally {
    if (sessionId) await closeSession(chromedriverPort, sessionId).catch(() => {})
    driver.stop()
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
