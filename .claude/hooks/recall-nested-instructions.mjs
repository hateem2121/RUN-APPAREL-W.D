#!/usr/bin/env node
/**
 * UserPromptSubmit hook — after a compaction, say which nested CLAUDE.md files
 * exist and are NOT loaded.
 *
 * WHY HERE. See note-compaction.mjs for why this cannot live in the PostCompact hook
 * that detects the compaction: that event has no decision control and its output is
 * discarded. UserPromptSubmit is the first event after a compaction that accepts
 * `additionalContext` ("can't replace the prompt; it only injects additionalContext
 * alongside it"), so the reminder arrives on the next thing the owner types.
 *
 * WHY IT DISCOVERS THE FILES INSTEAD OF LISTING THEM. A hardcoded list is a citation,
 * and this repo has a subagent (.claude/agents/docs-drift.md) whose entire job is
 * that citations here go stale silently — `16b548a` moved a test file and CLAUDE.md
 * named the old path for weeks. A glob cannot rot: split the pipeline traps into a
 * sixth file tomorrow and this reminder names it without being edited.
 *
 * WHY IT FIRES ONCE. The marker is deleted on read. A reminder repeated on every
 * prompt is one the owner learns to skip, which is the failure mode
 * guard-pipeline-input.mjs already warns about for gates.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const MARKER = '.claude/.compact-pending'
const SKIP = new Set(['node_modules', '.git', 'dist', 'output', '.wrangler', '3D Products'])

/** Every CLAUDE.md below `dir`, repo-relative, root file excluded by the caller. */
function findClaudeMd(dir, root, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    if (SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) findClaudeMd(full, root, found)
    else if (entry.name === 'CLAUDE.md') found.push(relative(root, full))
  }
  return found
}

/**
 * Every path rule in `.claude/rules/`, repo-relative. Added 2026-09-26, when the root
 * file's cross-cutting traps moved into nine such rules: they are no more re-injected
 * after `/compact` than a nested CLAUDE.md is, so they belong in the same reminder.
 * Discovered, not listed, for the same reason as findClaudeMd.
 */
function findRules(root) {
  try {
    return readdirSync(join(root, '.claude/rules'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => `.claude/rules/${entry.name}`)
      .sort()
  } catch {
    return []
  }
}

async function readStdin() {
  try {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    return Buffer.concat(chunks).toString('utf8')
  } catch {
    return ''
  }
}

await readStdin() // Drain stdin even when unused; a blocked pipe stalls the prompt.
try {
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const marker = join(root, MARKER)
  if (!existsSync(marker)) process.exit(0)
  rmSync(marker, { force: true })

  const nested = findClaudeMd(root, root).filter((p) => p !== 'CLAUDE.md')
  const rules = findRules(root)
  if (nested.length === 0 && rules.length === 0) process.exit(0)

  const rows = nested
    .map((p) => {
      let size = 0
      try {
        size = statSync(join(root, p)).size
      } catch {
        size = 0
      }
      return `  ${p} (${size.toLocaleString('en-US')} bytes)`
    })
    .join('\n')

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext:
          'Context was just compacted. Only the ROOT CLAUDE.md is re-injected, so the ' +
          'instruction files below are NOT in context right now — each holds traps the ' +
          'root file only indexes:\n\n' +
          `${rows}\n` +
          (rules.length > 0
            ? '\nPath rules (each reloads only when the Read tool opens a file its `paths:` ' +
              `names):\n${rules.map((p) => `  ${p}`).join('\n')}\n`
            : '') +
          '\nRead the relevant one BEFORE changing anything in its area. The root file ' +
          'says this about itself, but says it from the only file that survived.',
      },
    }),
  )
} catch {
  // A missed reminder is cheaper than a broken prompt.
}
process.exit(0)
