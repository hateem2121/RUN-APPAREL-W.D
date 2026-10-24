/**
 * Drive REAL Safari on an iOS Simulator, over W3C WebDriver, via Apple's `safaridriver`.
 *
 * WHY THIS EXISTS. Several audit lines can only be answered on a phone — the № glyph in
 * the section labels, the theme-toggle flash, iPhone layout at a real viewport. Until now
 * the repo had no way to ask: grep for `simctl|safaridriver|useSimulator` across every
 * package returned two comments and no harness.
 *
 * ⚠️ THIS IS A SIMULATOR, AND EVERY RESULT MUST SAY SO. A Simulator runs on the host
 * Mac's CPU, GPU and thermal envelope. Rendering, DOM, CSS and the accessibility tree are
 * real Safari and are trustworthy; **frame rate, scroll feel and anything time-based are
 * NOT device numbers** and must never be reported as such. `SIMULATOR_CAVEAT` exists to be
 * printed beside any measurement taken here.
 *
 * ⚠️ iOS 27.0 DOES NOT WORK, AND THE FAILURE IS NOT YOURS. Measured 2026-09-16 with a
 * control: three session requests in one safaridriver process — an iOS 27 device by UDID,
 * any iOS 27 host, and an iOS 26.5 host. The first two returned "Could not find any
 * session hosts that match the requested capabilities"; the third created a session. So
 * the harness is sound and iOS 27's host enumeration is broken, the same week Xcode 27
 * broke Appium/WebDriverAgent the same way (appium/appium#22368). Adding more iOS 27
 * devices cannot help — it is the runtime that is undiscoverable, not the device list.
 * **`DEFAULT_PLATFORM_VERSION` is therefore 26.5.** Re-test 27 after each Xcode update.
 *
 * ⚠️ DO NOT QUIT `DeviceHub.app`. Xcode 27 deleted `Simulator.app` and replaced it with
 * DeviceHub; quitting DeviceHub shuts down EVERY booted simulator, including ones the
 * owner started and is using. Nothing here launches or quits it.
 *
 * ⚠️ PIN THE FIXTURE SERVER'S PORT WHEN YOU START IT. `apps/viewer/e2e/serve.mjs` takes
 * its port from the environment, exactly as `playwright.config.ts` pins it for the real
 * suite. A server that comes up on another port yields "Can't Open Page" in the simulator,
 * which reads as a networking failure and is not one — measured 2026-09-16, and it cost a
 * wrong conclusion before the server's own first log line was read.
 *
 * Reachability IS proven: with the port pinned, the simulator loaded
 * `http://localhost:4173/n001/wine` and reported the real title and `<h1>`. A Simulator
 * shares the host's network stack, so `localhost` is the Mac.
 */

import {
  closeSession,
  evaluate,
  go,
  json,
  newSession,
  readSessionIdWith,
  startDriverProcess,
} from './webdriver-client.mjs'

// The W3C calls are the same for both phones, so they live in one module (2026-10-25).
export { closeSession, evaluate, go }

/** Print this beside any measurement taken through this module. */
export const SIMULATOR_CAVEAT =
  'iOS Simulator on the host Mac: rendering, DOM and accessibility are real Safari; ' +
  'frame rate and anything time-based are NOT device numbers.'

/** iOS 27 cannot be driven (see the header). 26.5 is the newest runtime that works. */
export const DEFAULT_PLATFORM_VERSION = '26.5'

/**
 * The W3C `POST /session` body.
 *
 * `safari:useSimulator` is what separates a simulator from a physical device; without it
 * safaridriver looks for a real phone over USB and reports the same "no session hosts"
 * error that iOS 27 gives, which would make two very different faults indistinguishable.
 */
export function sessionBody({ platformVersion = DEFAULT_PLATFORM_VERSION, deviceUdid } = {}) {
  const alwaysMatch = {
    platformName: 'iOS',
    'safari:useSimulator': true,
  }
  // A UDID pins one device; without it safaridriver picks any host on that version.
  if (deviceUdid) alwaysMatch['safari:deviceUDID'] = deviceUdid
  else alwaysMatch['safari:platformVersion'] = platformVersion
  return { capabilities: { alwaysMatch } }
}

/**
 * The session id, or a thrown error carrying safaridriver's OWN message.
 *
 * ⚠️ The message matters more than the status. "Could not find any session hosts" means
 * the runtime is undiscoverable (iOS 27 today); a timeout means something else entirely.
 * Collapsing both into "session failed" is how a session spends an afternoon on the wrong
 * diagnosis.
 */
export function readSessionId(payload) {
  return readSessionIdWith(payload, {
    driver: 'safaridriver',
    explain: (message) =>
      /session hosts/i.test(message)
        ? '  → that runtime is not discoverable. iOS 27.0 fails this way on Xcode 27; ' +
          `use ${DEFAULT_PLATFORM_VERSION}. Adding more devices does not help.`
        : null,
  })
}

/** "iPhone 17 Pro · iOS 26.5 (simulator)" — for a report that names what it measured. */
export function describeHost(capabilities) {
  const name = capabilities?.['safari:deviceName'] ?? 'unknown device'
  const version = capabilities?.['safari:platformVersion'] ?? 'unknown iOS'
  return `${name} · iOS ${version} (simulator)`
}

/** Start safaridriver on `port`. Returns a handle with `.stop()`. Never runs `--enable`. */
export function startDriver(port) {
  return startDriverProcess({ command: 'safaridriver', args: ['-p', String(port)], port })
}

/** Open a session. Returns `{ sessionId, host }`, `host` being `describeHost`'s label. */
export async function openSession(port, options = {}) {
  const payload = await newSession(port, sessionBody(options))
  return {
    sessionId: readSessionId(payload),
    host: describeHost(payload?.value?.capabilities),
  }
}

/**
 * The standard W3C "Take Screenshot" — base64-encoded PNG of the current page, exactly
 * as real Safari drew it. Added for the two audit lines that need a human to judge a
 * picture (a colourway's rendered hue, a glyph's fallback face) rather than an assertion:
 * this returns the CAPTURE, never a pass/fail — the judgement stays a person's.
 */
export async function screenshot(port, sessionId) {
  const payload = await json(`http://127.0.0.1:${port}/session/${sessionId}/screenshot`, {
    method: 'GET',
  })
  return payload?.value
}
