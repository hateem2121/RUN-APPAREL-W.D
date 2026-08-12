#!/usr/bin/env node
/**
 * PreToolUse guard — refuse a bare `pnpm`, which is not on PATH here.
 *
 * WHY THIS EXISTS. It is the first trap in CLAUDE.md, and the reason it is worth
 * a mechanical guard rather than a paragraph is *where the failure surfaces*:
 *
 *   "Bare `pnpm` fails with exit 127 … `apps/viewer/e2e/prepare.mjs` shells out to
 *    `pnpm build`, so the whole e2e suite dies as `Timed out waiting 120000ms from
 *    config.webServer` with the real `status: 127` buried inside a child process."
 *
 * So the error message names a Playwright timeout and says nothing about pnpm.
 * Two dead-end runs went by before anyone ran `echo $PORT` for the sibling trap;
 * this one has the same shape.
 *
 * Verified on this machine 2026-08-12: `command -v pnpm` exits 1,
 * `pnpm --version` prints `command not found`.
 *
 * WHAT MADE IT URGENT. Until 2026-08-12 `.claude/settings.json` *pre-approved* the
 * broken form — `Bash(pnpm typecheck:*)`, `Bash(pnpm test:*)`, `Bash(pnpm build:*)`
 * were in the allow list. That skipped the permission prompt, i.e. the one moment
 * a human might have noticed, and ran straight into 127. Those three entries were
 * removed in the same commit that added this file; do not re-add them.
 *
 * WHAT IT DOES NOT BLOCK — this half is load-bearing, for the reason
 * guard-pipeline-input.mjs states: a gate the owner learns to override is worse
 * than no gate. Only a segment whose COMMAND is exactly `pnpm` is refused:
 *
 *   pnpm build                      -> denied
 *   FOO=1 pnpm -r test              -> denied (env assignments are skipped)
 *   npx --yes pnpm@10.33.0 build    -> allowed (the token is `pnpm@10.33.0`)
 *   cat pnpm-lock.yaml              -> allowed (different token, not in command position)
 *   grep pnpm docs/RUNBOOK.md       -> allowed (`pnpm` is an argument, not the command)
 *   git commit -m "use pnpm"        -> allowed (quoted, and not in command position)
 */

import { segments, tokenize } from './shell.mjs'

/**
 * The token actually being executed in this segment, or undefined.
 *
 * Leading `FOO=bar` assignments are skipped, because `NODE_ENV=production pnpm build`
 * is still a bare pnpm — and that exact shape appears in this repo's own scripts.
 * Common prefix commands are stepped over for the same reason: `time pnpm build` and
 * `env -u NODE_ENV pnpm build` both end up invoking pnpm.
 */
const PREFIXES = new Set(['time', 'nice', 'nohup', 'command', 'exec', 'sudo'])

function commandToken(tokens) {
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      i++
      continue
    }
    if (token === 'env') {
      // Step over `env` and its flags/assignments (env -u FOO BAR=1 pnpm build).
      i++
      while (
        i < tokens.length &&
        (tokens[i].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]))
      ) {
        // `-u` takes a value; skip it too.
        if (tokens[i] === '-u') i++
        i++
      }
      continue
    }
    if (PREFIXES.has(token)) {
      i++
      continue
    }
    return token
  }
  return undefined
}

/** True if the command executed by any segment is a bare `pnpm`. */
function usesBarePnpm(command) {
  for (const segment of segments(command)) {
    const cmd = commandToken(tokenize(segment))
    if (cmd === 'pnpm') return true
  }
  return false
}

function allow() {
  process.exit(0)
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}

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
    allow() // Never break the session over a parse failure in a guard.
  }

  if (payload.tool_name !== 'Bash') allow()
  const command = payload.tool_input?.command
  if (typeof command !== 'string') allow()
  if (!usesBarePnpm(command)) allow()

  deny(
    'Blocked: `pnpm` is not on PATH on this machine, so this exits 127.\n\n' +
      'Use `npx --yes pnpm@10.33.0 <script>` instead — that is what every documented\n' +
      '`pnpm <script>` in this repo means, and what .claude/settings.json allows.\n\n' +
      'This is guarded rather than remembered because of where the failure shows up:\n' +
      'e2e/prepare.mjs shells out to `pnpm build`, so a bare pnpm kills the whole e2e\n' +
      'suite as "Timed out waiting 120000ms from config.webServer" with the real\n' +
      'status: 127 buried in a child process. See CLAUDE.md, first trap.',
  )
})
