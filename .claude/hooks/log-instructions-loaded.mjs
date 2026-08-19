#!/usr/bin/env node
/**
 * InstructionsLoaded hook — record WHICH memory file loaded, WHEN, and WHY.
 *
 * WHY THIS EXISTS. The root `CLAUDE.md` makes three claims about its own loading
 * that, until 2026-08-19, nobody here had measured:
 *
 *   1. the root file loads at session start and is re-injected after `/compact`;
 *   2. a nested CLAUDE.md loads only when Claude reads a file in its directory;
 *   3. a trap moved out of the root can therefore be ABSENT from a compacted
 *      session until something touches that directory.
 *
 * Claim 3 is the cost the pipeline split accepted on 2026-08-19, so it is the one
 * worth being sure about. All three are stated in prose in a file whose own house
 * style is "prefer stating a measurement over an adjective" — this hook is what
 * turns them into measurements. `load_reason` distinguishes exactly the cases the
 * claims are about: `session_start`, `nested_traversal`, `path_glob_match`,
 * `include`, `compact`.
 *
 * HOW TO USE IT. Work normally, then read the log:
 *
 *   node -e "console.log(require('fs').readFileSync('.claude/instructions-loaded.log','utf8'))"
 *
 * To check claim 3, run a session until `/compact` fires and look for which paths
 * appear with `compact`. If a nested file appears there, this repo's compaction
 * paragraph is wrong and should be corrected — that is the point of logging it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never blocks and never throws: the docs are
 * explicit that the exit code for this event is ignored and the hook cannot modify
 * or prevent a load, so a crash here would be pure noise in the transcript for zero
 * effect. Every failure path exits 0 silently. It also does not log `file_content`,
 * which is the whole memory file — the log would be larger than the files it
 * describes, and the size is already recorded as a number.
 */
import { appendFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const LOG = '.claude/instructions-loaded.log'

/** Read all of stdin. Returns '' if the stream is closed or unreadable. */
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
  const abs = event.file_path ?? '(unknown)'
  // Repo-relative where possible; an absolute path outside the repo stays absolute,
  // because `~/.claude/CLAUDE.md` loading is itself worth seeing in this log.
  const rel = abs.startsWith(root) ? relative(root, abs) : abs
  const chars = typeof event.file_content === 'string' ? event.file_content.length : 0
  const line = [new Date().toISOString(), event.load_reason ?? '(no reason)', rel, `${chars}c`]
  appendFileSync(join(root, LOG), `${line.join('\t')}\n`)
} catch {
  // Malformed or empty payload: nothing useful to record, and nothing to fail.
}
process.exit(0)
