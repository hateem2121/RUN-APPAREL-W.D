/**
 * PreToolUse guard — refuse an Edit or Write that LOWERS a coverage floor.
 *
 * WHY THIS EXISTS. "Never lower a coverage floor to go green" has been a rule since the
 * floors were measured (.claude/rules/tests-and-fixtures.md, scripts/check-coverage.mjs,
 * the gates skill), and until 2026-10-09 it lived only in prose. Prose is followed most of
 * the time; a floor lowered once to get a red run green is a floor that has stopped
 * measuring anything, and nothing downstream notices — CI goes green by construction.
 * Anthropic's skills docs say a rule that must hold every time belongs in a hook
 * (code.claude.com/docs/en/skills, "Claude stops following a skill").
 *
 * WHAT IT JUDGES. The per-package `thresholds: { … }` blocks in every `vitest.config.ts`,
 * and `REPO_LINE_FLOOR` in `scripts/check-coverage.mjs`. It works out the file as it would
 * read after the edit and compares each number with the one on disk.
 *
 * WHAT IT DELIBERATELY ALLOWS. Raising a floor (the documented way to move one:
 * floor(measured) - 2), any edit that leaves every floor as it was, a brand-new config,
 * and every other file. Changing `include`/`exclude` to inflate a percentage — the
 * `App.tsx`/`Stage.tsx` trap in tests-and-fixtures.md — is NOT caught: that needs
 * judgment, so it stays a written rule.
 *
 * KNOWN LIMIT. Only the Edit and Write tools are seen. A `sed -i` through Bash is not.
 */

import { readFileSync, realpathSync } from 'node:fs'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const CONFIG = /^vitest\.config\.[cm]?[jt]s$/

/** True for the files whose numbers are floors. */
export function isFloorFile(path) {
  return (
    CONFIG.test(basename(path)) || path.replace(/\\/g, '/').endsWith('scripts/check-coverage.mjs')
  )
}

/** Every floor in a file's text, as `name → number`. Exported for the test. */
export function floors(text) {
  const found = new Map()
  const blocks = text.matchAll(/thresholds\s*:\s*\{([^}]*)\}/g)
  let index = 0
  for (const block of blocks) {
    for (const [, key, value] of block[1].matchAll(/(\w+)\s*:\s*(\d+(?:\.\d+)?)/g)) {
      found.set(`thresholds#${index}.${key}`, Number(value))
    }
    index++
  }
  const repo = text.match(/REPO_LINE_FLOOR\s*=\s*(\d+(?:\.\d+)?)/)
  if (repo) found.set('REPO_LINE_FLOOR', Number(repo[1]))
  return found
}

/** The file's text after this tool call, or null when it cannot be worked out. */
function after(tool, input, before) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : null
  if (tool !== 'Edit') return null
  const { old_string: from, new_string: to, replace_all: all } = input
  if (typeof from !== 'string' || typeof to !== 'string' || !before.includes(from)) return null
  return all ? before.split(from).join(to) : before.replace(from, () => to)
}

/** Why this tool call lowers a floor, or null. Exported for the test. */
export function refusal(tool, input) {
  const path = input?.file_path
  if (typeof path !== 'string' || !isFloorFile(path)) return null
  let before
  try {
    before = readFileSync(path, 'utf8')
  } catch {
    return null // a new file has no floor to lower
  }
  const next = after(tool, input, before)
  if (next === null) return null
  const was = floors(before)
  const now = floors(next)
  const lowered = []
  for (const [name, value] of was) {
    if (!now.has(name)) lowered.push(`${name} ${value} → removed`)
    else if (now.get(name) < value) lowered.push(`${name} ${value} → ${now.get(name)}`)
  }
  return lowered.length ? `this lowers a coverage floor in ${path}: ${lowered.join(', ')}.` : null
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `Blocked: ${reason}\n\n` +
          'Coverage floors are MEASURED, not chosen (.claude/rules/tests-and-fixtures.md):\n' +
          'if a change drops coverage under a floor, the answer is a test, not a smaller\n' +
          'number. Raising a floor is allowed. If the owner has decided a floor must go\n' +
          'down, they make that edit themselves.',
      },
    }),
  )
  process.exit(0)
}

// Run as a hook only when executed directly, so a test can import refusal(). Compared
// through realpath + pathToFileURL, as the sibling guards do.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
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
      process.exit(0) // never break the session over a parse failure in a guard
    }
    const reason = refusal(payload?.tool_name, payload?.tool_input)
    if (reason) deny(reason)
    process.exit(0)
  })
}
