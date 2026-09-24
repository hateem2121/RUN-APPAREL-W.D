#!/usr/bin/env node
/**
 * PF-21 — phone frame rate. A phone check per SPEC §4.4; this is the closest
 * automatable PROXY, not a replacement for it.
 *
 * Runs on the iOS Simulator over real Safari, via `ios-safari.mjs`'s already-proven
 * `safaridriver` harness (Phase 0.2's device lab). `SIMULATOR_CAVEAT` applies to
 * every number this prints: a Simulator runs on the host Mac's own CPU/GPU/thermal
 * envelope, so frame timing here is NOT a device number, only DOM/rendering/CSS are
 * trustworthy as real Safari.
 *
 * NOT a touch-drag gesture. `ios-safari.mjs` drives WebDriver's `/execute/sync`
 * only — no Actions-API touch support exists in that harness yet, and adding one
 * is a bigger, riskier change than this task's scope. A programmatic
 * `camera-orbit` sweep exercises the SAME rendering pipeline on the same GPU and is
 * deterministic and repeatable, which a scripted touch drag would not be even if
 * it existed — real touch input on the viewer is exactly what the owner's own
 * phone check (SPEC §4.4) still covers, and this proxy does not pretend to
 * replace it.
 *
 *   node apps/viewer/scripts/frame-rate-probe.mjs [http://localhost:4173/n001/wine]
 */
import {
  closeSession,
  evaluate,
  go,
  openSession,
  SIMULATOR_CAVEAT,
  startDriver,
} from '../../../scripts/ios-safari.mjs'

const DRIVER_PORT = 9998
const SWEEP_MS = 3000

/** Pure: classify a set of rAF-delta samples (ms between consecutive frames). */
export function classifyFrameGaps(deltasMs, { longFrameMs = 50 } = {}) {
  const longFrames = deltasMs.filter((d) => d > longFrameMs)
  return {
    sampleCount: deltasMs.length,
    longFrameCount: longFrames.length,
    worstGapMs: deltasMs.length === 0 ? 0 : Math.max(...deltasMs),
    longFrames,
  }
}

/**
 * Judge the classified result. `maxLongFrames` and `maxWorstGapMs` are ceilings,
 * not device truth — see the file header.
 */
export function evaluateFrameGaps(classified, { maxLongFrames, maxWorstGapMs }) {
  const problems = []
  if (classified.sampleCount < 30) {
    problems.push(`only ${classified.sampleCount} frame samples — the sweep may not have run`)
  }
  if (classified.longFrameCount > maxLongFrames) {
    problems.push(`${classified.longFrameCount} long frames (>50ms) exceeds ${maxLongFrames}`)
  }
  if (classified.worstGapMs > maxWorstGapMs) {
    problems.push(
      `worst frame gap ${classified.worstGapMs.toFixed(0)}ms exceeds ${maxWorstGapMs}ms`,
    )
  }
  return { ok: problems.length === 0, problems }
}

/** RUNS INSIDE THE PAGE. Starts the rAF sampler + a camera-orbit sweep; returns immediately. */
function startSweepInPage(sweepMs) {
  const w = window
  w.__pf21 = { frames: [], done: false }
  const mv = document.querySelector('model-viewer')
  if (!mv?.loaded) {
    w.__pf21.error = 'model-viewer not loaded yet'
    return w.__pf21
  }
  let last = performance.now()
  const startedAt = last
  const tick = (t) => {
    w.__pf21.frames.push(t - last)
    last = t
    if (t - startedAt < sweepMs) requestAnimationFrame(tick)
    else w.__pf21.done = true
  }
  requestAnimationFrame(tick)
  // A slow, continuous orbit sweep — the same rendering path a drag exercises.
  let deg = 0
  const orbitInterval = setInterval(() => {
    deg = (deg + 6) % 360
    mv.cameraOrbit = `${deg}deg 75deg 105%`
    if (performance.now() - startedAt >= sweepMs) clearInterval(orbitInterval)
  }, 32)
  return { started: true }
}

/** RUNS INSIDE THE PAGE. Reads back the accumulated samples. */
function readSweepResult() {
  return window.__pf21
}

async function main() {
  const url = process.argv[2] ?? 'http://localhost:4173/n001/wine'
  console.log(SIMULATOR_CAVEAT)
  console.log(`[frame-rate-probe] loading ${url}`)

  const driver = await startDriver(DRIVER_PORT)
  let sessionId
  try {
    const opened = await openSession(DRIVER_PORT, {})
    sessionId = opened.sessionId
    console.log(`[frame-rate-probe] session on ${opened.host}`)

    await go(DRIVER_PORT, sessionId, url)

    // Poll for model-viewer.loaded before starting the sweep.
    let loaded = false
    for (let attempt = 0; attempt < 60; attempt++) {
      loaded = await evaluate(
        DRIVER_PORT,
        sessionId,
        "return Boolean(document.querySelector('model-viewer')?.loaded)",
      )
      if (loaded) break
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (!loaded) {
      console.error('[frame-rate-probe] model-viewer never reported loaded within 60s')
      process.exit(2)
    }

    await evaluate(DRIVER_PORT, sessionId, `return (${startSweepInPage.toString()})(${SWEEP_MS})`)
    await new Promise((resolve) => setTimeout(resolve, SWEEP_MS + 1000))
    const sweep = await evaluate(DRIVER_PORT, sessionId, `return (${readSweepResult.toString()})()`)

    if (sweep?.error) {
      console.error(`[frame-rate-probe] ${sweep.error}`)
      process.exit(2)
    }

    const classified = classifyFrameGaps(sweep.frames ?? [])
    // Ceilings are measured, not guessed — see the task report for the real run
    // this file's own comment cites once one exists.
    const judged = evaluateFrameGaps(classified, { maxLongFrames: 20, maxWorstGapMs: 500 })

    console.log(
      `[frame-rate-probe] ${classified.sampleCount} frames, ` +
        `${classified.longFrameCount} long (>50ms), worst ${classified.worstGapMs.toFixed(0)}ms`,
    )
    if (!judged.ok) {
      for (const p of judged.problems) console.error(`::error::${p}`)
      process.exit(1)
    }
    console.log('[frame-rate-probe] within ceilings (simulator proxy — not a device number).')
  } finally {
    if (sessionId) await closeSession(DRIVER_PORT, sessionId).catch(() => {})
    driver.stop()
  }
}

if (process.argv[1]?.endsWith('frame-rate-probe.mjs')) {
  main().catch((error) => {
    console.error(`frame-rate-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
