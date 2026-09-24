/**
 * CAPTURE ONLY, for the two checks that need a person to look at a phone screen —
 * CO-11 (what colour do the BUTTER colourway's panels on `rxps` actually render as, on a
 * phone?) and TY-10 (which face does the № glyph fall back to, on a phone?).
 *
 * This does NOT judge either question. It drives real Safari on the iOS 26.5 Simulator
 * over `scripts/ios-safari.mjs` (do not reimplement that driver here), takes one
 * screenshot per target, and writes it to disk — a person still looks at the picture and
 * decides. `SIMULATOR_CAVEAT` applies: rendering, DOM and CSS are real Safari; a
 * Simulator's GPU and thermal envelope are not a phone's, and it is not a substitute
 * for a check on a real device. What this buys is not having to hold the owner's phone to
 * answer either question.
 *
 * ⚠️ PRODUCTION IS READ-ONLY. Every request this script makes is a plain page load (a
 * GET) of a public page — nothing here writes, and nothing here uses a plain, unflagged
 * browser: `safaridriver`-driven Safari sets `navigator.webdriver = true` per the W3C
 * WebDriver spec (confirmed empirically against the local fixture before this script ever
 * touched the live site — `apps/viewer/src/lib/telemetry.ts:142` no-ops on exactly that
 * flag), so this capture cannot record a fake real-visitor speed sample the way a plain
 * Chrome load would.
 *
 * Usage: `node scripts/phone-check-captures.mjs [co-11|ty-10|all] [--out <dir>]`
 * Defaults to `all` and `output/phone-check-captures/`.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  closeSession,
  evaluate,
  go,
  openSession,
  screenshot,
  SIMULATOR_CAVEAT,
  startDriver,
} from './ios-safari.mjs'

const PORT = 9622

const TARGETS = {
  'co-11': {
    label: 'CO-11 — the BUTTER colourway, rxps',
    url: 'https://viewer.wear-run.help/rxps/butter',
    readySelector: 'h1',
    file: 'co-11-butter-colourway.png',
    question:
      'What colour are the panels that should read as BUTTER (a pale yellow) in this ' + 'capture?',
  },
  'ty-10': {
    label: 'TY-10 — the № glyph, site home page',
    url: 'https://wear-run.help/',
    readySelector: '.section-number',
    file: 'ty-10-numero-glyph.png',
    question:
      'Which face is № rendered in, in the section labels (“№01 — What we make” ' +
      'etc.) — does it match the surrounding mono type, or has the OS substituted a ' +
      'visibly different font for just that glyph?',
  },
}

function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'))
  const outIndex = argv.indexOf('--out')
  return {
    which: positional[0] ?? 'all',
    outDir: outIndex >= 0 ? argv[outIndex + 1] : join('output', 'phone-check-captures'),
  }
}

async function captureOne(port, sessionId, key, outDir) {
  const target = TARGETS[key]
  console.log(`[phone-check-captures] ${target.label}`)
  console.log(`[phone-check-captures]   GET ${target.url}`)
  await go(port, sessionId, target.url)
  // Readiness only — this does not wait for the full 3D download (the poster/placeholder
  // cross-fade is itself informative for CO-11, and a fixed generous buffer is simpler and
  // more honest than guessing at a model-viewer-internal ready signal this script does not
  // otherwise need).
  const found = await evaluate(
    port,
    sessionId,
    'return Boolean(document.querySelector(arguments[0]))',
    [target.readySelector],
  )
  if (!found) {
    console.log(
      `[phone-check-captures]   WARNING: ${target.readySelector} never appeared — capturing anyway`,
    )
  }
  await new Promise((resolve) => setTimeout(resolve, 5000))

  const base64 = await screenshot(port, sessionId)
  if (!base64) throw new Error(`${key}: safaridriver returned no screenshot data`)
  const outPath = join(outDir, target.file)
  writeFileSync(outPath, Buffer.from(base64, 'base64'))
  console.log(`[phone-check-captures]   wrote ${outPath} (${base64.length} base64 chars)`)
  console.log(`[phone-check-captures]   QUESTION FOR A PERSON: ${target.question}`)
  return outPath
}

async function main() {
  const { which, outDir } = parseArgs(process.argv.slice(2))
  const keys = which === 'all' ? Object.keys(TARGETS) : [which]
  for (const key of keys) {
    if (!TARGETS[key]) {
      console.error(
        `Unknown target "${key}" — expected one of: all, ${Object.keys(TARGETS).join(', ')}`,
      )
      process.exitCode = 1
      return
    }
  }

  mkdirSync(outDir, { recursive: true })
  console.log(`[phone-check-captures] ${SIMULATOR_CAVEAT}`)
  console.log(
    '[phone-check-captures] CAPTURE ONLY — a person still judges each picture; this proves ' +
      'the simulator reached the page and rendered something, not that either question above ' +
      'has a good answer.',
  )

  const driver = await startDriver(PORT)
  let sessionId
  const written = []
  try {
    const session = await openSession(PORT, {})
    sessionId = session.sessionId
    console.log(`[phone-check-captures] Driving: ${session.host}`)
    for (const key of keys) {
      written.push(await captureOne(PORT, sessionId, key, outDir))
    }
  } finally {
    if (sessionId) await closeSession(PORT, sessionId).catch(() => {})
    driver.stop()
  }

  console.log(`[phone-check-captures] done — ${written.length} capture(s) in ${outDir}`)
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
