/**
 * The edge answers that mean "ask again later", not "the site is broken" — one list for the
 * Lighthouse robot and both probes that run beside it in lighthouse-live.yml.
 *
 * 403 and 429 are Free-plan Bot Fight Mode refusing datacenter traffic (.github/CLAUDE.md); 503
 * is a busy origin. Until 2026-10-18 the robot set 503 aside while both probes failed the job on
 * it, so one edge answer drew two verdicts in the same run (investigation F-09).
 */
export const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

export function isInconclusiveStatus(status) {
  return INCONCLUSIVE_STATUSES.has(status)
}
