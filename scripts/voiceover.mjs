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
 * workflow at `xcode-27` (it runs macOS 27 as of 2026-09-10 — the same unsupported
 * ceiling as above) or `macos-14` (deprecating on GitHub-hosted runners).
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
 * locally, where neither package is installed at all — and that file's own unit tests
 * must run with neither package installed, so a static import here would break the one
 * property they exist to prove. `NODE_PATH` does not fix this:
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

// The label once named only the runner ("real VoiceOver, GitHub macOS 26 runner").
// "VoiceOver" is the same name on macOS and iPhone, so a line read out of context —
// pasted into a chat, an issue, a summary — implied iPhone coverage, which this robot
// does not have. All three parts now appear on every PASS/FAIL line, terse but
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
/** Items stepped through one at a time (VO-Right) from the top of the web content while
 *  looking for the colourway tabs. The fixture page puts them in its first screen, well
 *  inside this; the bound only turns a page that never announces them into a named
 *  failure rather than a 30-minute job timeout. */
const ITEM_SEARCH_LIMIT = 80

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
 * Does a VoiceOver item's SPOKEN phrase announce it as a LEVEL-1 heading?
 *
 * MEASURED 2026-09-23, this repo's own first real CI run: `voiceOver.lastSpokenPhrase()`
 * on the product heading read `"heading level 1 velocity PERFORMANCE TEE 2 items"` — the
 * phrase itself leads with "heading level 1", which is what this checks for. Tolerant of
 * an optional comma before "heading" and any casing, since VoiceOver's exact punctuation
 * on other pages is not something this one measurement pins down. `\b` after the digit
 * stops "level 1" matching inside "level 10"+.
 */
export function isHeadingLevel1Announcement(spokenPhrase) {
  return /heading,?\s*level\s*1\b/i.test(String(spokenPhrase ?? ''))
}

/**
 * Collapses any RUN of whitespace or punctuation to exactly one space, and lowercases.
 * For comparing a SPOKEN phrase, never a raw DOM string: two words with NO separator
 * between them at all — the actual shape of a real accessibility fault — stay stuck
 * together and still fail a comparison built on this, which is the point of collapsing
 * existing separators rather than stripping them.
 *
 * MEASURED 2026-09-23, this repo's own first real CI run:
 * `voiceOver.itemText()` on the product heading read `"velocityPERFORMANCE TEE heading
 * level 1"` (no space at the `<span>` boundary `apps/viewer/src/components/
 * SerifAccent.tsx` renders) — but `voiceOver.lastSpokenPhrase()` for that SAME item read
 * `"heading level 1 velocity PERFORMANCE TEE 2 items"`, with a real space. The DOM does
 * contain a space there (a same-line JSX text node), and `.serif-accent`
 * (`packages/ui/src/base.css`) sets only font/style properties, no `display` change — so
 * itemText's missing space is an artifact of how VoiceOver's caption API joins two text
 * runs, not something a person hears. Checks below judge the SPOKEN phrase for exactly
 * this reason; itemText is kept in the log purely as a diagnostic.
 */
function normalizeSpokenText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s,;.!?]+/g, ' ')
    .trim()
}

/** Case-insensitive, separator-normalised substring match — see `normalizeSpokenText`
 *  for why this does not simply strip whitespace. `headingWithAccent(text, 'first')`
 *  (apps/viewer/src/components/SerifAccent.tsx) also lowercases the product name's
 *  first word in the DOM, so an exact-case comparison would be wrong by design on top
 *  of the spacing question. */
export function containsGarmentName(text, garmentName) {
  return normalizeSpokenText(text).includes(normalizeSpokenText(garmentName))
}

/**
 * Does a VoiceOver item's text announce a "tab" role?
 *
 * `ColourwayTabs.tsx` renders each colourway as `role="tab"` inside a `role="tablist"`
 * (read directly from that file). `\btab\b` requires a word boundary on both sides, so
 * it matches "Wine, tab, 1 of 5" but not "tablet" or "tabular" — negative-controlled in
 * apps/cms/src/voiceOver.test.ts.
 *
 * "tab group" is the TABLIST's own role name and "tab panel" the TABPANEL's, neither of
 * them a tab, so both are excluded: counted as tabs, a container announcement would pass
 * for a second, not-selected tab and could turn one real tab into a pass. MEASURED on run
 * 35880390762: the stage is the tab panel, read BEFORE the tablist, and VoiceOver spoke
 * "Wine tab panel" and "end of Wine tab panel"; before this exclusion both were counted,
 * and the pass reported the first as its "not-selected example". A phrase that carries
 * both a real "tab," and a trailing "tab group" still matches, on the first.
 */
export function isTabAnnouncement(itemText) {
  return /\btab\b(?!\s+(?:group|panel)\b)/i.test(String(itemText ?? ''))
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
 * follows that convention here — see the module header. Should a later VoiceOver ever
 * speak "not selected", that reads as NOT selected rather than matching on the word
 * inside it ("unselected" never matches: `\b` finds no boundary inside the word).
 */
export function isAnnouncedSelected(itemText) {
  return /(?<!\bnot\s)\bselected\b/i.test(String(itemText ?? ''))
}

/** One PASS/FAIL line. Every result line states what ran it, that it approximates and
 *  never replaces a person, and that iPhone gestures are not covered. */
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
 * `fullLog` is every item visited along the way, printed in full by the CI run: the
 * words a real VoiceOver session actually produces are the evidence, not an assumption
 * about what they should be.
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
    return { itemText, spokenPhrase }
  }

  await record('cursor position before navigating into web content')

  const results = []

  // Check (a): the garment name as a level-1 heading, judged on the SPOKEN phrase (see
  // isHeadingLevel1Announcement's own comment for why) — walking FORWARD from the top of
  // web content, the realistic shape of a person tabbing/arrowing through the page on
  // arrival.
  const isGarmentHeading = (spokenPhrase) =>
    isHeadingLevel1Announcement(spokenPhrase) && containsGarmentName(spokenPhrase, garmentName)

  let headingSpokenPhrase = ''
  let headingFoundForward = false
  for (let i = 0; i < HEADING_SEARCH_LIMIT; i++) {
    await voiceOver.nextHeading()
    ;({ spokenPhrase: headingSpokenPhrase } = await record(`forward heading candidate ${i + 1}`))
    if (isGarmentHeading(headingSpokenPhrase)) {
      headingFoundForward = true
      break
    }
  }
  results.push({
    name: 'garment name announced as a level-1 heading',
    pass: headingFoundForward,
    message: headingFoundForward
      ? `heading announced: ${JSON.stringify(headingSpokenPhrase)}`
      : `no level-1 heading announcing "${garmentName}" found within ${HEADING_SEARCH_LIMIT} headings walked forward`,
  })

  // Check (b): the colourway tabs, walked the way a person reads the page — one item at
  // a time (VO-Right), from the TOP of the web content, judged on the SPOKEN phrase as
  // check (a) is.
  //
  // MEASURED 2026-09-23, runs 35860297572 and 35862712717. `findNextControl`
  // (VO-Command-J) cannot find these tabs. Started from the product heading, which sits
  // ABOVE the tablist in the two-column layout (App.tsx: `.stage__aside` renders
  // <ProductIdentity> and then <ColourwayTabs>), it went straight to the "HOW WE BUILD YOUR
  // PRODUCT" button in `.content` and then answered "Last form element" every time.
  // VoiceOver's form-control navigation does not stop on `role="tab"` buttons. Before
  // that, started wherever a failed heading search left the cursor (the page's last
  // heading), it could not have found them either, so both of the earlier readings of
  // that failure were right about different runs.
  //
  // The TOP of the web content, not the heading, because in the one-column layout the
  // heading renders in `.content`, BELOW the stage and its tablist, where a forward walk
  // from it would never meet a tab.
  await voiceOver.perform(voiceOver.keyboardCommands.moveToAreaTop)
  await record('top of the web content (VO-Shift-Home)')
  const tabPhrases = []
  for (let i = 0; i < ITEM_SEARCH_LIMIT; i++) {
    await voiceOver.next()
    const { spokenPhrase } = await record(`item ${i + 1}`)
    if (isTabAnnouncement(spokenPhrase)) {
      tabPhrases.push(spokenPhrase)
      if (tabPhrases.length >= EXPECTED_COLOURWAY_COUNT) break
    }
  }
  const selectedTabs = tabPhrases.filter(isAnnouncedSelected)
  const unselectedTabs = tabPhrases.filter((text) => !isAnnouncedSelected(text))
  const tabsPass = tabPhrases.length >= 2 && selectedTabs.length >= 1 && unselectedTabs.length >= 1
  results.push({
    name: 'colourway tabs announced as tabs, current one announced as selected',
    pass: tabsPass,
    message: tabsPass
      ? `${tabPhrases.length} tab(s) found; selected example: ${JSON.stringify(selectedTabs[0])}; ` +
        `not-selected example: ${JSON.stringify(unselectedTabs[0])}`
      : `found ${tabPhrases.length} tab announcement(s) within ${ITEM_SEARCH_LIMIT} items read ` +
        `from the top of the web content (need ≥2 tabs, ≥1 selected, ≥1 not selected): ` +
        `${JSON.stringify(tabPhrases)}`,
  })

  return { results, fullLog }
}

/** Bounded so a page that never renders fails with a named, diagnosable error instead
 *  of the item-chooser dance timing out forty steps later with no clue why. */
const RENDER_WAIT_TIMEOUT_MS = 15_000

/**
 * Wait for the SPA to actually have rendered before VoiceOver goes hunting for web
 * content.
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
