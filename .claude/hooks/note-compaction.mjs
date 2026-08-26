#!/usr/bin/env node
/**
 * PostCompact hook — record that a compaction happened, for the sibling
 * UserPromptSubmit hook to act on.
 *
 * WHY THIS IS TWO HOOKS AND NOT ONE. The obvious design — have PostCompact re-inject
 * the nested-CLAUDE.md pointers directly — DOES NOT WORK, and the docs are explicit
 * about it rather than silent:
 *
 *   "PostCompact hooks have no decision control. They can't affect the compaction
 *    result but can perform follow-up tasks."
 *   "Claude Code discards a PostCompact hook's `systemMessage` and `continue` fields."
 *
 * So a PostCompact hook that returned `additionalContext` would run, exit 0, look
 * healthy in every log, and change nothing — the same silent-inertness this repo has
 * now shipped twice (`REFERENCE_PATHS` declared and never read; `Vary: Origin` green
 * and inert through two deploys). This file therefore does the one thing PostCompact
 * IS for — a side effect — and leaves the injection to an event that supports it.
 *
 * WHAT PROBLEM THE PAIR SOLVES. The root CLAUDE.md states it against itself:
 *
 *   "⚠️ These are hooks, not the traps. After `/compact` only THIS file is
 *    re-injected, so a compacted session that has not yet opened
 *    `tools/asset-pipeline/` has only these one-liners."
 *
 * That warning lives in the file that survives compaction, and describes a gap in
 * the files that do not — so it can tell you the nested traps are missing but cannot
 * give them back. Measured by this repo's own InstructionsLoaded log, which exists
 * precisely to test that claim.
 */
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

const MARKER = '.claude/.compact-pending'

async function readStdin() {
  try {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    return Buffer.concat(chunks).toString('utf8')
  } catch {
    return ''
  }
}

const raw = await readStdin()
try {
  const event = JSON.parse(raw)
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  // `trigger` is `manual` or `auto`; both lose the nested files, so both are recorded.
  const trigger = typeof event.trigger === 'string' ? event.trigger : 'unknown'
  appendFileSync(join(root, MARKER), `${new Date().toISOString()}\t${trigger}\n`)
} catch {
  // A marker that could not be written costs a reminder, not a session.
}
process.exit(0)
