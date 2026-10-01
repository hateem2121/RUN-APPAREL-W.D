/**
 * Escape text so a regular expression matches it literally.
 *
 * WHY (2026-10-01). Two places built patterns from host names with
 * `host.replace(/\./g, '\\.')`, escaping the dot and nothing else. GitHub's code scan
 * (CodeQL, js/incomplete-sanitization) flagged both: every host today is letters, digits,
 * dots and hyphens, so nothing could go wrong yet, but a value with `+`, `*` or `\` in it
 * would silently match other text. This escapes every special character. Plain host names
 * come out exactly as before (`cms\.wear-run\.help`), so no built pattern changes.
 *
 * Plain JavaScript, at the app root, because `siteHostRules.mjs` (read by next.config.mjs)
 * and `src/` TypeScript both import it — the same arrangement as `htmlLimitedBots.mjs`.
 *
 * @param {string} text
 * @returns {string}
 */
export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
