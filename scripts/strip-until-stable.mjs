/**
 * Replace every match of `pattern` in `text`, again and again, until the text stops
 * changing.
 *
 * WHY (2026-10-01). The probes read words off our own pages by stripping comments and
 * tags. One pass can leave markup behind — removing an inner `<!-- a -->` can join the
 * pieces around it into a fresh `<!-- … -->` — and GitHub's code scan flags exactly that
 * (js/incomplete-multi-character-sanitization). Repeating until stable cannot leave a
 * match. Bounded, so a replacement that re-creates its own match cannot loop for ever.
 *
 * @param {string} text
 * @param {RegExp} pattern a global (`g`) pattern
 * @param {string} replacement
 * @returns {string}
 */
export function stripUntilStable(text, pattern, replacement) {
  let current = text
  for (let pass = 0; pass < 100; pass++) {
    const next = current.replace(pattern, replacement)
    if (next === current) return next
    current = next
  }
  return current
}
