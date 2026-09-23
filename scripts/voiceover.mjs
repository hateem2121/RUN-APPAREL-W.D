/**
 * Drive REAL VoiceOver on macOS, over a real Safari/WebKit window, via Guidepup.
 *
 * WHY THIS EXISTS. Phase 0.2 of the 100/100 plan asked for a macOS VoiceOver robot
 * alongside the Android Chrome emulator (`scripts/android-chrome.mjs`) and the iPhone
 * Safari driver (`scripts/ios-safari.mjs`). Per `docs/OWNER-CHECKLIST.md`'s own "Not
 * covered" table: "Nobody has listened to these pages with VoiceOver or NVDA." This
 * closes that gap for VoiceOver.
 *
 * ⚠️ THIS MAC CANNOT RUN VOICEOVER. `@guidepup/guidepup` 0.34.0's manifest covers Darwin
 * majors 21-25 (macOS Monterey through Tahoe); this Mac is macOS 27.0 (Darwin 27.0.0),
 * one major past the ceiling (guidepup/guidepup#149, opened 2026-09-15; the fix, PR #151,
 * is still an open draft as of 2026-09-23). `voiceOver.start()` throws here. This module
 * is therefore built and unit-tested locally (see `apps/cms/src/voiceOver.test.ts`, which
 * imports only the pure decision functions below and never touches Guidepup or
 * Playwright), and the real VoiceOver session runs only in CI, on a GitHub-hosted
 * `macos-26` runner (Darwin 25.6.0 — inside the supported range). Never point this
 * workflow at `xcode-27` (macOS 27) or `macos-14` (deprecating) — see
 * `phase0/voiceover-robot-research.md` §3 and §5.
 *
 * WHY THE RUNTIME IMPORTS ARE DYNAMIC, AND WHY THE PATH IS RESOLVED BY HAND. Per the
 * brief, `@guidepup/guidepup` and `playwright` are installed for the CI run only, into
 * `$RUNNER_TEMP` via `npm install --no-save --prefix`, the same isolation
 * `scripts/android-chrome.mjs`'s CI step uses for `@puppeteer/browsers` — this repo's
 * `pnpm-lock.yaml` and every `package.json` stay untouched. That means these two
 * packages are NEVER siblings of this file in any `node_modules` tree Node's own module
 * resolver would find by walking up from `scripts/`, so a plain
 * `import { voiceOver } from '@guidepup/guidepup'` would throw `ERR_MODULE_NOT_FOUND` in
 * CI. It would ALSO throw the moment `apps/cms/src/voiceOver.test.ts` imported this file
 * locally, where neither package is installed at all — breaking the "no Guidepup import
 * needed here" contract the brief sets for that test file. `NODE_PATH` does not fix this:
 * MEASURED on this Mac, Node v26.8.2, 2026-09-23 — it is honoured for CommonJS `require()`
 * but NOT for ESM `import`/`import()`, which is what this file and its test both are.
 * `resolveRuntimeDepsDir()` + `importFromDepsDir()` instead resolve an ABSOLUTE
 * `file://` URL to each package's real entry file (reading its own `package.json`, the
 * same way Node's own resolver would) and dynamically `import()` that URL directly — a
 * mechanism that does not depend on any `node_modules` ancestry at all, verified working
 * locally (including a package's OWN transitive dependency resolving via its sibling
 * `node_modules`) before being relied on here. Both loader functions run only inside
 * `main()`, never at module load time, which is what keeps this file importable with
 * neither package present.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// ─── Honesty label — printed once in full, then a short tag on every PASS/FAIL line ──
//
// Matches the house pattern (`ANDROID_CAVEAT` in android-chrome.mjs, `SIMULATOR_CAVEAT`
// in ios-safari.mjs): the full sentence once, a short parenthetical on every result line
// so no line can be read out of context and mistaken for a real user's report.

export const VOICEOVER_CAVEAT =
  'Real VoiceOver on a GitHub-hosted macOS 26 runner (Darwin 25.6.0), driving a real ' +
  'WebKit window: it approximates, and never replaces, a person using VoiceOver. iPhone ' +
  'VoiceOver gestures are not covered — this is the desktop macOS screen reader only.'

// FIX ROUND 1: this used to carry only the first of the brief's three required parts
// ("real VoiceOver, GitHub macOS 26 runner"). "VoiceOver" names the SAME screen reader
// on both macOS and iPhone, so a line pasted out of context — into a chat, an issue, a
// summary — read as if it said something about iPhone VoiceOver coverage, which this
// robot does not have. All three parts now appear on every PASS/FAIL line, terse but
// complete: what ran it, what it does not claim, and what it does not cover.
export const VOICEOVER_HONESTY_LABEL =
  'real VoiceOver, GitHub macOS 26 runner — approximates, never replaces, a person; ' +
  'iPhone VoiceOver gestures not covered'

// ─── Fixture-specific defaults ────────────────────────────────────────────────────────
//
// `n001`/`wine` is the e2e fixture product (apps/viewer/e2e/serve.mjs); "Velocity
// Performance" is `PRODUCTS.n001.productName` there, read directly from that file, not
// guessed. Matches the case-insensitive substring `apps/viewer/e2e/a11y.spec.ts` and
// `viewer.spec.ts` already assert against the same heading
// (`toContainText(/Velocity Performance/i)`).

export const DEFAULT_TARGET_URL = 'http://127.0.0.1:4173/n001/wine'
export const DEFAULT_GARMENT_NAME = 'Velocity Performance'

/**
 * How many colourways the e2e fixture ships for n001 (`apps/viewer/e2e/serve.mjs`'s
 * `COLOURWAYS`: wine, blush, butter, lime, black). Used only to stop the tab search
 * early once every expected tab has been seen — never as a strict pass requirement,
 * since check (b) only needs at least two (see `runChecks`).
 */
export const EXPECTED_COLOURWAY_COUNT = 5

const HEADING_SEARCH_LIMIT = 8
const CONTROL_SEARCH_LIMIT = 60

/**
 * The macOS application name VoiceOver's `macOSActivate()` must bring to the front for
 * Playwright's bundled WebKit browser specifically. Not a guess: read directly from
 * `@guidepup/guidepup-playwright`'s own `src/applicationNameMap.ts` at the pinned
 * `@guidepup/playwright@0.19.1` tag — `{ webkit: "Playwright" }`. Playwright's own WebKit
 * build identifies itself to macOS as an app named "Playwright", not "Safari".
 * https://github.com/guidepup/guidepup-playwright/blob/0.19.1/src/applicationNameMap.ts
 */
export const WEBKIT_APPLICATION_NAME = 'Playwright'

/**
 * Disables VoiceOver Utility's "Verbosity → Hints → Speak instructions", which is ON by
 * default and adds a spoken sentence like "To exit this web area, press
 * Control-Option-Shift-Up Arrow" after ordinary items — noise that would otherwise land
 * in every phrase this robot reads. Documented directly by the Guidepup maintainer,
 * guidepup/guidepup#82 (comment dated 2026-08-02, current as of `@guidepup/guidepup`
 * 0.34.0 — the setting shipped in 0.30.0):
 * https://github.com/guidepup/guidepup/issues/82#issuecomment-3148842911
 *   await voiceOver.start({ settings: { SCRShouldOutputVOInstructions: false } })
 */
export const DISABLE_SPEAK_INSTRUCTIONS_SETTINGS = { SCRShouldOutputVOInstructions: false }

/** The 100ms step delay `voiceOverTest.ts` (0.19.1) uses throughout its own item-chooser
 *  dance — kept identical rather than re-tuned, since it is the value the mechanism this
 *  file ports was actually proven against. */
const NAVIGATE_STEP_DELAY_MS = 100

/** Safety bound on the two open-ended `while` loops `navigateToWebContent` ports from
 *  `voiceOverTest.ts` (there, both are unbounded `while (true)`/`while (!match)` loops).
 *  This is a deliberate addition over the ported original: in a CI job, an unbounded loop
 *  is only ever stopped by the job's own `timeout-minutes`, which reports as an opaque
 *  cancellation rather than a named error. It does not change behaviour on the success
 *  path — only what happens if VoiceOver never reports what the loop is waiting for. */
const NAVIGATE_RETRY_LIMIT = 30

const MARKER_ELEMENT_ID = '__guidepup_marker__'

// ─── Pure decision functions — unit-tested by apps/cms/src/voiceOver.test.ts, no ──────
// ─── Guidepup or Playwright import required to exercise any of them.               ────

/**
 * The ESM-appropriate relative entry path for an installed package, read from its own
 * `package.json` the way Node's resolver would: prefer `exports["."].import`, then
 * `exports["."].default`, then top-level `main`, then the bare-CJS default `index.js`.
 *
 * WHY NOT JUST `main`. `playwright@1.63.0`'s own registry metadata (checked 2026-09-23)
 * declares BOTH `"main": "index.js"` (its CommonJS entry) AND
 * `"exports": { ".": { "import": "./index.mjs", ... } }` — a DIFFERENT file for ESM
 * importers. Reading `main` alone would load the CJS build under Node's import-of-CJS
 * interop instead of the package's own intended ESM entry. `@guidepup/guidepup@0.34.0`
 * has no `exports` field at all (confirmed against its own registry metadata), so it
 * falls through to `main` (`lib/index.js`) correctly.
 */
export function resolveEsmEntry(packageJson) {
  const dotExport = packageJson?.exports?.['.']
  if (typeof dotExport === 'string') return dotExport
  if (dotExport && typeof dotExport === 'object') {
    if (typeof dotExport.import === 'string') return dotExport.import
    if (typeof dotExport.default === 'string') return dotExport.default
  }
  if (typeof packageJson?.main === 'string') return packageJson.main
  return 'index.js'
}

/**
 * Does a VoiceOver item's text announce it as a LEVEL-1 heading?
 *
 * Shape confirmed against `@guidepup/playwright`'s own README example (0.19.1, live
 * fetched 2026-09-23): `voiceOver.itemText()` on a heading returns text of the form
 * `"<name> heading level 1"`. Tolerant of an optional comma before "heading" and any
 * casing, since neither was pinned down as certain by that one example — the real CI run
 * is what confirms the exact phrase (see the module header and the report this task
 * writes). `\b` after the digit stops "level 1" matching inside "level 10"+.
 */
export function isHeadingLevel1Announcement(itemText) {
  return /heading,?\s*level\s*1\b/i.test(String(itemText ?? ''))
}

/** Case-insensitive substring match — `headingWithAccent(text, 'first')`
 *  (apps/viewer/src/components/SerifAccent.tsx) lowercases the product name's first
 *  word in the DOM, so an exact-case comparison would be wrong by design, not just
 *  overly strict. */
export function containsGarmentName(text, garmentName) {
  return String(text ?? '')
    .toLowerCase()
    .includes(String(garmentName ?? '').toLowerCase())
}

/**
 * Does a VoiceOver item's text announce a "tab" role?
 *
 * `ColourwayTabs.tsx` renders each colourway as `role="tab"` inside a `role="tablist"`
 * (read directly from that file). `\btab\b` requires a word boundary on both sides, so
 * it matches "Wine, tab, 1 of 5" but not "tablet" or "tabular" — negative-controlled in
 * apps/cms/src/voiceOver.test.ts.
 */
export function isTabAnnouncement(itemText) {
  return /\btab\b/i.test(String(itemText ?? ''))
}

/**
 * Does a VoiceOver item's text announce it as selected?
 *
 * `ColourwayTabs.tsx` sets `aria-selected={colourway.slug === selected.slug}` — a
 * BOOLEAN on every tab, never omitted — so the standard, documented convention for
 * `aria-selected` on a tab (unlike `aria-checked` on a checkbox) is to speak "selected"
 * only when true and add nothing when false, never an explicit "not selected". Check (b)
 * below relies on exactly that asymmetry: the CURRENT tab must match this, and at least
 * one OTHER tab must not. The first real CI run is what confirms VoiceOver actually
 * follows that convention here — see the module header.
 */
export function isAnnouncedSelected(itemText) {
  return /\bselected\b/i.test(String(itemText ?? ''))
}

/** One PASS/FAIL line, honesty label included on every line per the brief. */
export function formatCheckLine({ pass, name, message }) {
  const status = pass ? 'PASS' : 'FAIL'
  return `${status} (${VOICEOVER_HONESTY_LABEL}): ${name} — ${message}`
}

// ─── Runtime dependency loading — never called at module import time ─────────────────

/**
 * Where the CI-only, `--no-save` install of `@guidepup/guidepup` + `playwright` landed
 * (`npm install --no-save --prefix "$GUIDEPUP_DEPS_DIR" ...` in the workflow). Throws a
 * clear, named error rather than letting a bare-specifier import fail somewhere deeper
 * with `ERR_MODULE_NOT_FOUND` and no context — this variable being unset is the one
 * environment precondition this module cannot check for itself.
 */
export function resolveRuntimeDepsDir(env = process.env) {
  const dir = env.GUIDEPUP_DEPS_DIR
  if (!dir) {
    throw new Error(
      'GUIDEPUP_DEPS_DIR is not set. This module needs @guidepup/guidepup and playwright ' +
        'installed to that directory (see .github/workflows/voiceover.yml) — it never ' +
        'depends on this repo’s own node_modules, so pnpm-lock.yaml stays untouched.',
    )
  }
  return dir
}

/**
 * Dynamically import `packageName`'s real entry module from `depsDir/node_modules/...`,
 * by absolute `file://` URL — see the module header for why a bare-specifier import
 * cannot reach a package installed outside this file's own `node_modules` ancestry.
 * Returns the CJS-interop default export when present (guidepup's CJS build), otherwise
 * the ESM namespace itself (playwright's own `.mjs` entry) — so a caller can destructure
 * either shape the same way.
 */
export async function importFromDepsDir(depsDir, packageName) {
  const pkgDir = join(depsDir, 'node_modules', ...packageName.split('/'))
  const packageJson = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'))
  const entryUrl = pathToFileURL(join(pkgDir, resolveEsmEntry(packageJson))).href
  const mod = await import(entryUrl)
  return mod.default ?? mod
}

// ─── The item-chooser dance: get VoiceOver's cursor into the page's web content ──────

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function injectMarker(markerId) {
  const marker = document.createElement('input')
  marker.id = markerId
  marker.type = 'text'
  marker.value = 'Guidepup Marker'
  marker.readOnly = true
  marker.tabIndex = -1
  marker.autocomplete = 'off'
  marker.setAttribute('aria-label', 'Guidepup Marker')
  marker.style.cssText =
    'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;'
  document.body.prepend(marker)
}

function removeMarker(markerId) {
  const marker = document.querySelector(`#${markerId}`)
  if (marker) document.body.removeChild(marker)
}

/**
 * The Item-Chooser dance inside `navigateToWebContent` below (cancel, close menus, open
 * the chooser and confirm it opened, type "web content" one character at a time with a
 * confirming read after each, back off and retry on a miss, Enter, interact, step to the
 * first element — in this order, with the same 100ms delays between steps) is a PORT of
 * `@guidepup/playwright`'s own `src/voiceOverTest.ts`, from the `guidepup/guidepup-playwright`
 * GitHub repository, at tag `0.19.1`:
 * https://github.com/guidepup/guidepup-playwright/blob/0.19.1/src/voiceOverTest.ts
 *
 * That file, and the package it is published as, carry the following licence, copied
 * exactly from `LICENSE` in the same repository at the same tag
 * (https://github.com/guidepup/guidepup-playwright/blob/0.19.1/LICENSE), reproduced here
 * in full because what is ported below is a substantial portion of that file:
 *
 * MIT License
 *
 * Copyright (c) 2023 Craig Morten
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Move the VoiceOver cursor into the page's web content, reliably, regardless of where
 * the cursor started.
 *
 * HOW MUCH OF THIS IS VERBATIM. The command sequence is: it is the same VoiceOver
 * commands, in the same order, with the same delays, as `voiceOverTest.ts` (0.19.1,
 * licence above) — that helper is reachable only through Playwright's TEST RUNNER
 * (`voiceOverTest` attaches it to a fixture object `test.extend()` builds at
 * test-start), and this repo's other two device-lab robots
 * (`scripts/android-chrome.mjs`, `scripts/ios-safari.mjs`) are both plain
 * `node`-invoked CLI scripts, not `playwright test` specs, so the same algorithm had to
 * be carried onto a plain function rather than left inside a fixture.
 *
 * EXACTLY THREE THINGS ARE DIFFERENT FROM THE ORIGINAL, and only these three:
 *   1. **Bounded retries.** The original's two open-ended loops
 *      (`while (true)` opening the Item Chooser, `while (!matched)` searching it) are
 *      each capped here at `NAVIGATE_RETRY_LIMIT` attempts, throwing a named error on
 *      exhaustion. In a CI job an unbounded loop is only ever stopped by the job's own
 *      `timeout-minutes`, which reports as an opaque cancellation rather than a
 *      diagnosable error — this does not change behaviour on the success path.
 *   2. **Explicit parameters.** `voiceOver`, `macOSActivate`, `MacOSKeyCodes` and `page`
 *      are ordinary function parameters here, not values closed over from a Playwright
 *      fixture — there is no fixture in a plain CLI script.
 *   3. **Dropped log housekeeping.** The original also clears VoiceOver's own
 *      accumulated spoken-phrase/item-text logs around this dance and restores their
 *      pre-navigation contents, so the item-chooser's own noise never appears in a
 *      caller's `.spokenPhraseLog()`/`.itemTextLog()`. This script never calls those two
 *      accumulating methods — `runChecks()` below reads `itemText()`/`lastSpokenPhrase()`
 *      fresh after each of its own moves and builds its own transcript instead — so that
 *      housekeeping has nothing to protect here and is dropped.
 * Everything else — which commands, in which order, with which delays, and why the
 * marker element and the character-by-character typing exist at all — is the original's,
 * not reinvented.
 *
 * WHY IT IS THIS INVOLVED. VoiceOver reads OS focus, not the DOM — there is no direct
 * hand-off between "the browser navigated" and "the screen reader is looking at the right
 * thing". The real mechanism: bring the browser app to the front, drop a temporary,
 * off-screen, `aria-label`led marker element, open VoiceOver's own Item Chooser
 * (VO-Command-I) and type "web content" until it matches the page's web-content group,
 * interact into it, then step to the first element. Skipping any of these steps is
 * exactly how an unmeasured shortcut would silently land the cursor on the browser's own
 * chrome — the tab bar, the address bar — instead of the page.
 */
export async function navigateToWebContent({
  voiceOver,
  macOSActivate,
  MacOSKeyCodes,
  page,
  capture,
}) {
  const cancelCurrentInteraction = () =>
    voiceOver.perform({ keyCode: MacOSKeyCodes.Control }, { capture: false })
  const closeMenus = () => voiceOver.perform({ keyCode: MacOSKeyCodes.Escape }, { capture: false })

  await macOSActivate(WEBKIT_APPLICATION_NAME)
  await cancelCurrentInteraction()
  await delay(NAVIGATE_STEP_DELAY_MS)

  await page.bringToFront()
  await page.locator('body').waitFor()

  try {
    await page.evaluate(injectMarker, MARKER_ELEMENT_ID)

    // Open the Item Chooser, retrying the open until its OWN spoken phrase confirms it
    // is actually open — a stale menu state is a real failure mode of driving VoiceOver's
    // UI from cold, not a hypothetical one (this is exactly what the ported original
    // guards against).
    let lastSpokenPhrase = ''
    for (let attempt = 0; attempt < NAVIGATE_RETRY_LIMIT; attempt++) {
      if (lastSpokenPhrase.toLowerCase().includes('item chooser')) break
      await cancelCurrentInteraction()
      await delay(NAVIGATE_STEP_DELAY_MS)
      await closeMenus()
      await delay(NAVIGATE_STEP_DELAY_MS)
      await voiceOver.perform(voiceOver.keyboardCommands.openItemChooser, { capture: true })
      lastSpokenPhrase = await voiceOver.lastSpokenPhrase()
      if (
        attempt === NAVIGATE_RETRY_LIMIT - 1 &&
        !lastSpokenPhrase.toLowerCase().includes('item chooser')
      ) {
        throw new Error(
          `VoiceOver's Item Chooser never reported open after ${NAVIGATE_RETRY_LIMIT} attempts ` +
            `(last spoken phrase: ${JSON.stringify(lastSpokenPhrase)})`,
        )
      }
    }

    // Type "web content" one character at a time until the chooser's own incremental
    // search narrows to it — a single multi-character `.type()` call races the chooser's
    // search UI on a cold start, which is why the original types character-by-character.
    let matched = false
    for (let attempt = 0; attempt < NAVIGATE_RETRY_LIMIT && !matched; attempt++) {
      for (const character of 'web content') {
        await cancelCurrentInteraction()
        await delay(NAVIGATE_STEP_DELAY_MS)
        await voiceOver.type(character, { capture: 'initial' })
        const spoken = await voiceOver.lastSpokenPhrase()
        if (spoken.toLowerCase().includes('web content')) {
          matched = true
          break
        }
      }
      if (matched) break
      await voiceOver.perform({ keyCode: MacOSKeyCodes.Backspace }, { capture: false })
      await delay(NAVIGATE_STEP_DELAY_MS)
    }
    if (!matched) {
      throw new Error(
        `VoiceOver's Item Chooser search never matched "web content" after ${NAVIGATE_RETRY_LIMIT} attempts`,
      )
    }
    await voiceOver.perform({ keyCode: MacOSKeyCodes.Enter }, { capture: false })

    await voiceOver.interact({ capture: false })
    await delay(NAVIGATE_STEP_DELAY_MS)

    await voiceOver.next({ capture })
  } finally {
    await page.evaluate(removeMarker, MARKER_ELEMENT_ID)
  }
}

// ─── The two real checks ───────────────────────────────────────────────────────────────

/**
 * (a) VoiceOver announces the garment name as a heading (level 1).
 * (b) Moving onto the colourway tabs: announced as tabs, the current one announced as
 *     selected, and at least one other announced WITHOUT "selected".
 *
 * Returns `{ results, fullLog }` — `results` is one `{ name, pass, message }` per check,
 * `fullLog` is every item visited along the way, for the CI run to print in full (the
 * brief: "Do not assume the words: record the phrase log VoiceOver actually produced").
 */
export async function runChecks({ voiceOver, garmentName }) {
  const fullLog = []
  const record = async (label) => {
    const itemText = await voiceOver
      .itemText()
      .catch((error) => `<itemText() failed: ${error.message}>`)
    const spokenPhrase = await voiceOver
      .lastSpokenPhrase()
      .catch((error) => `<lastSpokenPhrase() failed: ${error.message}>`)
    fullLog.push({ label, itemText, spokenPhrase })
    return itemText
  }

  await record('cursor position before navigating into web content')

  const results = []

  // Check (a): the garment name as a level-1 heading.
  let headingItemText = ''
  let headingFound = false
  for (let i = 0; i < HEADING_SEARCH_LIMIT; i++) {
    await voiceOver.nextHeading()
    headingItemText = await record(`heading candidate ${i + 1}`)
    if (
      isHeadingLevel1Announcement(headingItemText) &&
      containsGarmentName(headingItemText, garmentName)
    ) {
      headingFound = true
      break
    }
  }
  results.push({
    name: 'garment name announced as a level-1 heading',
    pass: headingFound,
    message: headingFound
      ? `heading announced: ${JSON.stringify(headingItemText)}`
      : `no level-1 heading announcing "${garmentName}" found within ${HEADING_SEARCH_LIMIT} headings`,
  })

  // Check (b): colourway tabs.
  const tabTexts = []
  for (let i = 0; i < CONTROL_SEARCH_LIMIT; i++) {
    await voiceOver.perform(voiceOver.keyboardCommands.findNextControl)
    const controlItemText = await record(`control candidate ${i + 1}`)
    if (isTabAnnouncement(controlItemText)) {
      tabTexts.push(controlItemText)
      if (tabTexts.length >= EXPECTED_COLOURWAY_COUNT) break
    }
  }
  const selectedTabs = tabTexts.filter(isAnnouncedSelected)
  const unselectedTabs = tabTexts.filter((text) => !isAnnouncedSelected(text))
  const tabsPass = tabTexts.length >= 2 && selectedTabs.length >= 1 && unselectedTabs.length >= 1
  results.push({
    name: 'colourway tabs announced as tabs, current one announced as selected',
    pass: tabsPass,
    message: tabsPass
      ? `${tabTexts.length} tab(s) found; selected example: ${JSON.stringify(selectedTabs[0])}; ` +
        `not-selected example: ${JSON.stringify(unselectedTabs[0])}`
      : `found ${tabTexts.length} tab announcement(s) within ${CONTROL_SEARCH_LIMIT} controls ` +
        `(need ≥2 tabs, ≥1 selected, ≥1 not selected): ${JSON.stringify(tabTexts)}`,
  })

  return { results, fullLog }
}

/** Bounded so a page that never renders fails with a named, diagnosable error instead
 *  of the item-chooser dance timing out forty steps later with no clue why. */
const RENDER_WAIT_TIMEOUT_MS = 15_000

/**
 * FIX ROUND 1. Wait for the SPA to actually have rendered before VoiceOver goes
 * hunting for web content.
 *
 * `page.goto(url, { waitUntil: 'load' })` resolves once the shell HTML/JS has arrived —
 * apps/viewer is a client-rendered SPA (see App.tsx), so at that point React has not yet
 * fetched the product payload or rendered the heading and colourway tabs check (a)/(b)
 * are looking for. Without this wait, `navigateToWebContent` could start its Item
 * Chooser search against an empty or loading page, which would read as this robot being
 * broken rather than as the page still loading.
 *
 * Waits for the two elements the two real checks below actually need — the level-1
 * heading (`apps/viewer/src/components/ProductIdentity.tsx`'s `<h1>`) and the colourway
 * tablist (`apps/viewer/src/components/ColourwayTabs.tsx`'s `role="tablist"`) — rather
 * than a generic "network idle" wait, which would still pass on a page that rendered an
 * error state with neither element present.
 */
async function waitForPageToRender(page) {
  try {
    await page
      .getByRole('heading', { level: 1 })
      .waitFor({ state: 'visible', timeout: RENDER_WAIT_TIMEOUT_MS })
    await page.getByRole('tablist').waitFor({ state: 'visible', timeout: RENDER_WAIT_TIMEOUT_MS })
  } catch (error) {
    throw new Error(
      `The page never rendered its heading and colourway tablist within ` +
        `${RENDER_WAIT_TIMEOUT_MS}ms of navigation — is the fixture server actually ` +
        `serving product data for this URL? (${error.message})`,
    )
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────────────
//
// Run in CI once VoiceOver's environment is prepared and the two runtime deps are
// installed to GUIDEPUP_DEPS_DIR (see .github/workflows/voiceover.yml):
//   node scripts/voiceover.mjs [url] [garmentName]

async function main() {
  const targetUrl = process.argv[2] || DEFAULT_TARGET_URL
  const garmentName = process.argv[3] || DEFAULT_GARMENT_NAME

  console.log(VOICEOVER_CAVEAT)
  console.log(`Target: ${targetUrl}`)

  const depsDir = resolveRuntimeDepsDir()
  const { voiceOver, macOSActivate, MacOSKeyCodes } = await importFromDepsDir(
    depsDir,
    '@guidepup/guidepup',
  )
  const { webkit } = await importFromDepsDir(depsDir, 'playwright')

  await voiceOver.start({ settings: DISABLE_SPEAK_INSTRUCTIONS_SETTINGS, capture: 'initial' })

  let browser
  let exitCode = 0
  try {
    browser = await webkit.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(targetUrl, { waitUntil: 'load' })
    await waitForPageToRender(page)

    await navigateToWebContent({
      voiceOver,
      macOSActivate,
      MacOSKeyCodes,
      page,
      capture: 'initial',
    })

    const { results, fullLog } = await runChecks({ voiceOver, garmentName })

    for (const result of results) {
      console.log(formatCheckLine(result))
      if (!result.pass) exitCode = 1
    }

    console.log('Spoken-phrase / item-text log for this run:')
    console.log(JSON.stringify(fullLog, null, 2))
  } finally {
    if (browser) await browser.close().catch(() => {})
    try {
      await voiceOver.stop()
    } catch {
      // Best-effort teardown, matching voiceOverTest.ts's own swallow-on-stop-failure.
    }
  }

  process.exitCode = exitCode
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
