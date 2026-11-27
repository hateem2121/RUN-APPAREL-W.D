#!/usr/bin/env node
/**
 * PreToolUse note — a test or gate piped through a filter reports the FILTER's exit code.
 *
 * WHY THIS EXISTS. On 2026-11-27 a pull request (#503) was pushed with a failing check. The
 * quoted-settings test had been run as `… vitest run … | grep …`: the test failed, `grep`
 * succeeded, and the shell reports only the last program in a pipe, so the chain read as a pass.
 * A second push fixed it. The rule was already written down twice (a memory note, and the
 * `npx` line in the local notes) and was broken anyway, which is why it is a hook now.
 *
 * WHAT IT DOES. It never refuses and never rewrites. When a command pipes a test or gate into
 * anything else, and nothing in the command keeps the test's own exit code, it adds a note next
 * to the tool result (`hookSpecificOutput.additionalContext`, Claude Code hooks reference, read
 * 2026-11-27). Reading a long log through `tail` is a fair thing to do; calling it a pass is not.
 *
 * WHAT KEEPS IT QUIET, because a note that fires on everything is read by nobody:
 *   - the command sets `pipefail`, or reads `PIPESTATUS` / `pipestatus`;
 *   - the piped program is a reader (`grep vitest notes.md | head` runs no test);
 *   - the words sit inside quotes or a heredoc (a commit message that names a test).
 *
 * WHAT IT CANNOT SEE. A test named only by a variable (`node "$t" | tail -1`) has no test
 * shape left once the quoted text is set aside, so it passes unnoted. Measured 2026-11-27.
 */
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { stripHeredocs, tokenize } from './shell.mjs'

/** Programs that read or print and never run a test, whatever their arguments say. */
const READERS = new Set([
  'grep',
  'rg',
  'cat',
  'head',
  'tail',
  'sed',
  'awk',
  'perl',
  'echo',
  'printf',
  'ls',
  'find',
  'git',
  'gh',
  'curl',
  'jq',
  'wc',
  'cut',
  'sort',
  'uniq',
  'tee',
  'less',
  'diff',
  'file',
  'which',
  'cd',
])

const PREFIXES = new Set([
  'time',
  'nice',
  'nohup',
  'command',
  'exec',
  'env',
  // Loop and branch words: `do node --test x | tail` still runs the test.
  'do',
  'then',
  'else',
])

/** What a stage looks like when it runs a test or one of this repository's gates. */
const TEST_SHAPES = [
  /\bvitest\b/,
  /\bplaywright\s+test\b/,
  /\bnode\s+(?:\S+\s+)*--test\b/,
  /\S+\.test\.m?[jt]sx?\b/,
  /\bpnpm(?:@\S+)?\s+(?:\S+\s+)*(?:test\S*|lint|typecheck|build|eval:\S+)(?:\s|$)/,
  /\brun-gates\.mjs\b/,
  /\bcheck-[\w-]+\.mjs\b/,
  /\b(?:doc-citations|quoted-settings)\.mjs\b/,
  /\btest-alert-shell\.sh\b/,
  /\btsc\b/,
  /\bbiome\s+(?:check|ci|lint)\b/,
  /\b(?:actionlint|zizmor|knip)\b/,
]

/**
 * Split a command into pipelines, each a list of stages. `a | b && c` gives [[a, b], [c]].
 * Quotes and backslash escapes hide separators, as in shell.mjs `segments()`, which cannot be
 * reused here because it throws away WHICH separator it found, and that is the whole question.
 */
export function pipelines(command) {
  const source = stripHeredocs(command)
  const all = []
  let stages = []
  let current = ''
  let quote = null
  const endStage = () => {
    stages.push(current)
    current = ''
  }
  const endPipeline = () => {
    endStage()
    all.push(stages)
    stages = []
  }
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '\\') {
      current += char + (source[i + 1] ?? '')
      i++
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }
    const two = char + (source[i + 1] ?? '')
    if (two === '&&' || two === '||') {
      endPipeline()
      i++
      continue
    }
    if (char === ';' || char === '\n') {
      endPipeline()
      continue
    }
    if (char === '|') {
      endStage()
      if (source[i + 1] === '&') i++ // `|&` pipes stderr too; still a pipe
      continue
    }
    current += char
  }
  endPipeline()
  return all
}

/** The program a stage runs, stepping over `FOO=1`, `time`, `env` and an opening bracket. */
function program(stage) {
  for (const token of tokenize(stage.replace(/^[\s({]+/, ''))) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue
    if (PREFIXES.has(token)) continue
    return token
  }
  return undefined
}

/** A stage with its quoted text removed, so a test's name inside a string is not a test run. */
function unquoted(stage) {
  return stage.replace(/"[^"]*"|'[^']*'/g, ' ')
}

function runsATest(stage) {
  const name = program(stage)
  if (!name || READERS.has(name)) return false
  const text = unquoted(stage)
  return TEST_SHAPES.some((shape) => shape.test(text))
}

/**
 * The test stage whose exit code this command hides, or null.
 * @param {string} command
 * @returns {string | null}
 */
export function hiddenTest(command) {
  if (/\bpipefail\b|\bPIPESTATUS\b|\bpipestatus\b/.test(command)) return null
  for (const stages of pipelines(command)) {
    // Every stage but the last has its exit code thrown away.
    for (const stage of stages.slice(0, -1)) {
      if (runsATest(stage)) return stage.trim()
    }
  }
  return null
}

export function note(stage) {
  return (
    "The exit code of this command is NOT the test's. It pipes a test or gate into another " +
    'program, and the shell reports only the last program in a pipe, so a failing test reads as ' +
    `success here.\n\n  piped: ${stage.slice(0, 200)}\n\n` +
    'Do not call this a pass. Run it again without the pipe, or put `set -o pipefail;` in front ' +
    '(bash and zsh) and read the exit code. With pipefail a `grep` that matches nothing also ' +
    'exits 1, so read which program failed. (Pull request #503, 2026-11-27: a failing check was ' +
    'pushed this way.)'
  )
}

function main() {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    raw += chunk
  })
  process.stdin.on('end', () => {
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      process.exit(0) // Never break the session over a parse failure in a hook.
    }
    const command = payload?.tool_input?.command
    if (payload?.tool_name !== 'Bash' || typeof command !== 'string') process.exit(0)
    const stage = hiddenTest(command)
    if (stage === null) process.exit(0)
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: note(stage) },
      }),
    )
    process.exit(0)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main()
