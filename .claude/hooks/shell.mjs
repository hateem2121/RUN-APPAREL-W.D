/**
 * Shell-command parsing shared by the PreToolUse guards.
 *
 * WHY THIS IS SHARED RATHER THAN COPIED. Both guards need the same three
 * operations, and on 2026-08-12 both were bitten by the SAME missing one within
 * ten minutes of each other: a `git commit -F - <<'EOF'` whose message described
 * the commands a guard denies was parsed as those commands. guard-bare-pnpm.mjs
 * blocked its own first commit; guard-pipeline-input.mjs — which had shipped
 * without heredoc handling since 2026-08-06 — then blocked the commit that fixed
 * it, on the phrase `pipeline optimize output/…`.
 *
 * Two copies of a parser that must agree is the shape this repo already has rules
 * about (see isMediaReferenced vs find-orphan-media.mjs in CLAUDE.md, where the
 * two lists silently disagreed and the one that deletes files went blind). One
 * module, imported twice.
 */

/**
 * Remove here-document BODIES.
 *
 * Must run before segmentation: segments split on newlines, so any line of prose
 * inside a heredoc otherwise parses as a command. Heredoc text is data.
 *
 * Handles `<<EOF`, `<<'EOF'`, `<<"EOF"` and `<<-EOF` (the dash form allows a
 * tab-indented terminator).
 */
export function stripHeredocs(command) {
  const opener = /<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/
  // Consume left to right into `kept`, so an opener that was just handled can
  // never be rediscovered. An earlier version removed the body but left the
  // `<<'EOF'` token in place and rescanned from zero, matching the same opener
  // forever — the test run hung rather than failing, which is the more expensive
  // way to be wrong.
  let rest = command
  let kept = ''
  for (;;) {
    const match = opener.exec(rest)
    if (!match) return kept + rest
    const delimiter = match[1] ?? match[2] ?? match[3]
    // Keep the opener itself; dropping it would rejoin two unrelated segments.
    const afterOpener = match.index + match[0].length
    kept += rest.slice(0, afterOpener)
    const bodyStart = rest.indexOf('\n', afterOpener)
    if (bodyStart === -1) return kept // opener with no body: nothing left to scan
    const terminator = new RegExp(`\\n[ \\t]*${delimiter}[ \\t]*(?=\\n|$)`)
    const offset = rest.slice(bodyStart).search(terminator)
    // An unterminated heredoc means the remainder is all body.
    if (offset === -1) return kept
    rest = rest.slice(bodyStart + offset)
  }
}

/** Split a shell command into separately-executed segments, heredoc bodies removed. */
export function segments(command) {
  return stripHeredocs(command).split(/&&|\|\||;|\n|(?<!\|)\|(?!\|)/g)
}

/** Naive but sufficient tokenizer: keeps quoted runs whole, then strips the quotes. */
export function tokenize(segment) {
  const tokens = segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return tokens.map((token) => token.replace(/^["']|["']$/g, ''))
}
