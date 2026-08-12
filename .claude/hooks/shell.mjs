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

/**
 * Split a shell command into separately-executed segments, heredoc bodies removed.
 *
 * Operators inside QUOTES do not separate anything — they are data, for exactly the
 * reason heredoc bodies are. This was a plain `.split(/&&|\|\||;|\n|\|/)` until
 * 2026-08-12, when guard-bare-pnpm.mjs denied an ordinary
 * `grep -n 'pnpm a\|pnpm b' CLAUDE.md`: the regex split on the `\|` *inside the
 * search pattern* and manufactured a segment whose first token was `pnpm`. Note the
 * direction of that failure — a guard that DENIES turns a parsing slip into a
 * blocked legitimate command, and the message blames the user's tooling.
 *
 * An unterminated quote deliberately swallows the remainder. That matches the shell
 * (the text really is inside the string and never executes) and so cannot hide a
 * command that would have run.
 */
export function segments(command) {
  const source = stripHeredocs(command)
  const found = []
  let current = ''
  let quote = null
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '\\') {
      // Consume the escaped character so `\|` outside quotes is not a separator.
      current += char + (source[i + 1] ?? '')
      i++
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }
    const twoChar = char + (source[i + 1] ?? '')
    if (twoChar === '&&' || twoChar === '||') {
      found.push(current)
      current = ''
      i++
      continue
    }
    if (char === ';' || char === '\n' || char === '|') {
      found.push(current)
      current = ''
      continue
    }
    current += char
  }
  found.push(current)
  return found
}

/** Naive but sufficient tokenizer: keeps quoted runs whole, then strips the quotes. */
export function tokenize(segment) {
  const tokens = segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return tokens.map((token) => token.replace(/^["']|["']$/g, ''))
}
