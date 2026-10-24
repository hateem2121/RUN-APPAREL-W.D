/**
 * The W3C WebDriver client the two phone harnesses share: `ios-safari.mjs` (safaridriver, the
 * iOS Simulator) and `android-chrome.mjs` (chromedriver, an Android emulator).
 *
 * WHY ONE MODULE. Until 2026-10-25 each file carried its own copy of these functions, and
 * android-chrome.mjs said its HTTP calls were "byte-for-byte the same shapes as ios-safari.mjs's".
 * A fix to one (a longer status wait, a changed request body) had to be made twice by someone who
 * remembered the other file existed. What differs between the two phones stays in their own files:
 * the capabilities each sends, the words each uses to explain a failed session, the driver binary
 * and its flags, and each one's host label.
 *
 * Nothing here knows which phone it is driving; the W3C endpoints are the same for both.
 */

import { spawn } from 'node:child_process'

/** `fetch`, then the JSON body. WebDriver answers errors as JSON too, so no status check here. */
export const json = async (url, init) => {
  const response = await fetch(url, init)
  return response.json()
}

/**
 * The session id from a `POST /session` reply, or a thrown error carrying the driver's OWN
 * message (the real diagnosis; never replace it with a summary).
 *
 * `explain(message)` returns extra guidance to print under the driver's message, or `null` for
 * none. It is each phone's own: iOS recognises one measured failure ("session hosts"), Android
 * has no measured failure to recognise and gives generic causes.
 *
 * @param {unknown} payload parsed JSON of the reply
 * @param {{ driver: string, explain: (message: string) => string | null }} how
 */
export function readSessionIdWith(payload, { driver, explain }) {
  const value = payload?.value
  if (value?.sessionId) return value.sessionId
  const message = value?.message ?? `${driver} returned no sessionId and no message`
  const guidance = explain(message)
  throw new Error(guidance ? `${message}\n${guidance}` : message)
}

/**
 * Start a driver process listening on `port`. Returns a handle with `.stop()`.
 *
 * The drivers have no ready signal beyond answering their status endpoint, so this polls it
 * instead of sleeping. 40 tries at 250 ms is the 10 s both harnesses always waited; the two
 * options exist so a test can use a short wait.
 *
 * @param {{ command: string, args: string[], port: number, attempts?: number, intervalMs?: number }} options
 */
export async function startDriverProcess({ command, args, port, attempts = 40, intervalMs = 250 }) {
  const child = spawn(command, args, { stdio: 'ignore' })
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/status`)
      return { port, stop: () => child.kill() }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
  child.kill()
  throw new Error(
    `${command} did not answer on port ${port} within ${Math.round((attempts * intervalMs) / 1000)}s`,
  )
}

/** `POST /session` with a capabilities body. Returns the driver's parsed reply. */
export function newSession(port, body) {
  return json(`http://127.0.0.1:${port}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

/** Always call this, even on failure — a leaked session holds the phone's browser open. */
export async function closeSession(port, sessionId) {
  await fetch(`http://127.0.0.1:${port}/session/${sessionId}`, { method: 'DELETE' })
}
