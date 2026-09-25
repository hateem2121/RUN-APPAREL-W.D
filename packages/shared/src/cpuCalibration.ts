/**
 * CALIBRATED CPU THROTTLING for the PF-04/05 browser tests on BOTH hosts — the slowdown
 * that makes THIS machine behave like the reference machine under a 4x throttle, the
 * approach Chrome DevTools' own calibrated CPU throttling takes (measure the machine,
 * then pick the multiplier). Here, in the shared package, for the reason
 * `tokenContract.ts` is: one copy both apps' specs read, so the reference score and the
 * benchmark that produced it can never drift apart.
 *
 * Measured 2026-09-25: a flat 4x throttle is 4x of WHATEVER the machine is. On a loaded
 * garment the identical viewer walkthrough read tbt 133-235ms / inp 136-200ms on the Mac
 * that set the ceilings and tbt 358-373ms / inp 376-400ms on CI's runner, ~2.2x slower,
 * so one fixed ceiling was either too tight for CI or too loose to catch a planted 300ms
 * freeze on the Mac (one passed at 600/500). Scaling the multiplier by the machine's own
 * score makes both imitate the same phone, so one ceiling means the same on both.
 *
 * REFERENCE_BENCHMARK is `cpuBenchmarkInPage()`'s score on that Mac, headless Chromium,
 * unthrottled: 550-607 over 26 runs in four sessions, median ~580.
 */
export const REFERENCE_BENCHMARK = 580
export const TARGET_SLOWDOWN = 4

/**
 * @param benchmarkScore this machine's `cpuBenchmarkInPage()` score (higher = faster)
 * @returns the rate to pass to CDP's `Emulation.setCPUThrottlingRate`
 */
export function calibratedThrottleRate(benchmarkScore: number): number {
  if (!(benchmarkScore > 0)) {
    throw new Error(`benchmark score must be a positive number, got ${benchmarkScore}`)
  }
  // A rate below 1 would ask the machine to run FASTER than it can; clamp, and let the
  // ceiling fail honestly on a machine too slow to imitate the reference at all.
  return Math.min(8, Math.max(1, TARGET_SLOWDOWN * (benchmarkScore / REFERENCE_BENCHMARK)))
}

/**
 * Can this machine stand in for the reference at all? At least 80% of the reference's
 * score counts; anything slower is judged against its own, wider ceilings.
 *
 * ⚠️ WHY A TIER AND NOT JUST THE RATE, measured 2026-09-25. The throttle only slows the
 * page's main thread. On the viewer the walkthrough's cost is dominated by SOFTWARE 3D
 * (SwiftShader), which runs in the GPU process that CDP throttling never touches: this
 * Mac read tbt 139-235ms at 4x and still only 229-283ms at 12x. CI's runner scored 104
 * and 171 (3.4-5.6x slower) and read 331-373ms even UNTHROTTLED, so no rate could make it
 * imitate the reference, and the unclamped-rate test (`score >= reference / 4`, i.e. 145)
 * would have counted its 171-score run as able to. So a slower machine is recognised by
 * its score and given ceilings measured ON it, rather than pretending the rate fixed it.
 */
export const REFERENCE_CLASS_FRACTION = 0.8

export function isReferenceClass(benchmarkScore: number): boolean {
  return benchmarkScore >= REFERENCE_BENCHMARK * REFERENCE_CLASS_FRACTION
}

/**
 * The benchmark. SELF-CONTAINED on purpose: `page.evaluate` serialises the function's
 * source, so it may reference nothing outside its own body. Counts fixed string-and-sort
 * work units finished in 250ms; run it UNTHROTTLED. `performance` is reached through
 * `globalThis` because this package compiles against ES2022 alone (no DOM, no node types).
 */
export function cpuBenchmarkInPage(): number {
  const clock = (globalThis as unknown as { performance: { now(): number } }).performance
  const t0 = clock.now()
  let n = 0
  while (clock.now() - t0 < 250) {
    const a: string[] = []
    for (let i = 0; i < 5000; i++) a.push(String((i * 7919) % 5003))
    a.sort()
    n++
  }
  return n
}
