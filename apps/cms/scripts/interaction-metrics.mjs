/**
 * PF-04 (long tasks / Total Blocking Time) + PF-05 (an INP proxy) — pure functions
 * over raw Performance API samples collected in-page by an e2e spec.
 *
 * Duplicated from `apps/viewer/scripts/interaction-metrics.mjs` rather than shared
 * across apps: `biome.jsonc`'s module-boundary rule forbids cross-app imports
 * outside test files, and this one small pure-function module is cheaper to keep in
 * step by hand than to relocate into `packages/shared` for two callers.
 */

/**
 * Total Blocking Time: the standard definition — for every long task (duration
 * >50ms), only the portion PAST the first 50ms counts as "blocking".
 *
 * @param {number[]} longTaskDurationsMs
 * @returns {number}
 */
export function totalBlockingTime(longTaskDurationsMs) {
  return longTaskDurationsMs.reduce((sum, d) => sum + Math.max(0, d - 50), 0)
}

/** @param {number[]} longTaskDurationsMs @returns {number} */
export function worstLongTask(longTaskDurationsMs) {
  return longTaskDurationsMs.length === 0 ? 0 : Math.max(...longTaskDurationsMs)
}

/**
 * An INP proxy: the worst single interaction's Event Timing `duration` across the
 * walkthrough — a proxy for the real (session-wide, 98th-percentile) INP metric,
 * built from a small, fixed set of scripted interactions.
 *
 * @param {number[]} eventDurationsMs
 * @returns {number}
 */
export function worstInteraction(eventDurationsMs) {
  return eventDurationsMs.length === 0 ? 0 : Math.max(...eventDurationsMs)
}

/**
 * Judge a walkthrough's samples against ceilings.
 *
 * @param {{ longTasks: number[], events: number[] }} samples
 * @param {{ tbtCeilingMs: number, inpCeilingMs: number }} ceilings
 */
export function evaluateInteractionWalkthrough(samples, { tbtCeilingMs, inpCeilingMs }) {
  const tbt = totalBlockingTime(samples.longTasks)
  const worstTask = worstLongTask(samples.longTasks)
  const inpProxy = worstInteraction(samples.events)
  const problems = []
  if (tbt > tbtCeilingMs) {
    problems.push(`total blocking time ${tbt.toFixed(0)}ms exceeds the ${tbtCeilingMs}ms ceiling`)
  }
  if (inpProxy > inpCeilingMs) {
    problems.push(
      `worst interaction ${inpProxy.toFixed(0)}ms exceeds the ${inpCeilingMs}ms INP-proxy ceiling`,
    )
  }
  return { ok: problems.length === 0, problems, tbt, worstTask, inpProxy }
}
