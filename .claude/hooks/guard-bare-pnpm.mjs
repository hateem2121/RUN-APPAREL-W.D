#!/usr/bin/env node
/**
 * PreToolUse guard — a bare `pnpm` does not reliably run here, so rewrite it (or refuse).
 *
 * WHY THIS EXISTS. It is the pnpm note under "What this is" in the root CLAUDE.md,
 * and the reason it is worth a mechanical guard rather than a paragraph is *where
 * the failure surfaces*:
 *
 *   "Bare `pnpm` fails with exit 127 … `apps/viewer/e2e/prepare.mjs` shells out to
 *    `pnpm build`, so the whole e2e suite dies as `Timed out waiting 120000ms from
 *    config.webServer` with the real `status: 127` buried inside a child process."
 *
 * So the error message names a Playwright timeout and says nothing about pnpm.
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
 * WHAT IT DOES NOT TOUCH — this half is load-bearing, for the reason
 * guard-pipeline-input.mjs states: a gate the owner learns to override is worse
 * than no gate. Only a segment whose COMMAND is exactly `pnpm` is acted on:
 *
 *   pnpm build                      -> rewritten
 *   FOO=1 pnpm -r test              -> rewritten (env assignments are skipped)
 *   npx --yes pnpm@10.34.5 build    -> untouched (the token is `pnpm@10.34.5`)
 *   cat pnpm-lock.yaml              -> untouched (different token, not in command position)
 *   grep pnpm docs/RUNBOOK.md       -> untouched (`pnpm` is an argument, not the command)
 *   git commit -m "use pnpm"        -> untouched (quoted, and not in command position)
 *
 * WHAT CHANGED 2026-08-26: IT REWRITES RATHER THAN REFUSES, WHERE IT SAFELY CAN.
 * PreToolUse supports `updatedInput` under `hookSpecificOutput`, which "replaces a
 * tool's arguments before it runs" — so `pnpm test` simply becomes
 * `npx --yes pnpm@10.34.5 test` instead of costing a turn to retype. The protection
 * is identical; only the friction is gone, and a gate with no friction is a gate
 * nobody learns to route around.
 *
 * THREE THINGS THAT KEEP THE REWRITE HONEST:
 *
 *   1. It rewrites only a command with NO quotes and NO heredoc. Quotes are the only
 *      thing that makes a separator ambiguous, and this guard has already been bitten
 *      by exactly that: a `grep -n 'pnpm a\|pnpm b'` split on the `\|` INSIDE the
 *      search pattern and manufactured a segment beginning `pnpm`. Anything quoted
 *      falls back to the proven deny. A wrong REWRITE runs a command nobody typed,
 *      which is worse than a wrong deny, so the ambiguous half keeps the old answer.
 *   2. `updatedInput` replaces the ENTIRE input object, per the docs, so the whole
 *      original `tool_input` is echoed back with only `command` changed. Sending
 *      `{ command }` alone would silently drop `description`, `timeout` and
 *      `run_in_background`.
 *   3. It auto-approves nothing the owner has not already approved. The allow-list is
 *      READ FROM .claude/settings.json at runtime rather than copied here: two lists
 *      that must agree is the shape this repo has a rule about (isMediaReferenced vs
 *      find-orphan-media.mjs, where the copy went blind — and the blind one was the
 *      script that DELETES files). A rewrite matching an existing allow rule is
 *      allowed; anything else is `ask`, which shows the rewritten command first.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { segments, tokenize } from './shell.mjs'

/** The one form that works here. A constant so the uses below cannot drift apart. */
const PNPM = 'npx --yes pnpm@10.34.5'

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

/**
 * Rewrite every command-position `pnpm` to the npx form, or null when unsafe.
 *
 * `segments()` deliberately discards its separators, so this re-splits with a
 * capturing group to keep them: even indices are segments, odd indices are the
 * `&&` / `||` / `;` / `|` / newline that joined them. That is only sound because a
 * quoted command has already been rejected above — otherwise a separator could be
 * hiding inside a string, which is the bug this guard has already shipped once.
 */
function rewrite(command) {
  if (command.includes("'") || command.includes('"')) return null
  if (/<<-?\s*[A-Za-z_]/.test(command)) return null

  const parts = command.split(/(\s*(?:&&|\|\||;|\||\n)\s*)/)
  let changed = false
  for (let i = 0; i < parts.length; i += 2) {
    if (commandToken(tokenize(parts[i])) !== 'pnpm') continue
    const before = parts[i]
    // Replace the first standalone `pnpm` token only; a later one is an argument.
    parts[i] = before.replace(/(^|\s)pnpm(\s|$)/, `$1${PNPM}$2`)
    if (parts[i] === before) return null // could not place it: do not guess
    changed = true
  }
  return changed ? parts.join('') : null
}

/**
 * The repo's own pre-approved Bash rules, read from settings rather than duplicated.
 * `Bash(npx --yes pnpm@10.34.5 test:*)` becomes the prefix `npx --yes pnpm@10.34.5 test`.
 */
function approvedBashPrefixes(root) {
  try {
    const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'))
    const rules = settings?.permissions?.allow
    if (!Array.isArray(rules)) return []
    return rules
      .filter((rule) => typeof rule === 'string' && rule.startsWith('Bash(') && rule.endsWith(')'))
      .map((rule) => rule.slice('Bash('.length, -1))
      .map((rule) => (rule.endsWith(':*') ? rule.slice(0, -2) : rule))
  } catch {
    // No settings, unreadable settings, or a shape that is not the one expected:
    // approve nothing. The caller falls back to `ask`, which is the safe direction.
    return []
  }
}

function allow() {
  process.exit(0)
}

/** Replace the tool's input, keeping every field the caller sent. */
function rewriteTo(command, toolInput, decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: reason,
        updatedInput: { ...toolInput, command },
      },
    }),
  )
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
  const toolInput = payload.tool_input ?? {}
  const command = toolInput.command
  if (typeof command !== 'string') allow()
  if (!usesBarePnpm(command)) allow()

  const fixed = rewrite(command)
  if (fixed !== null) {
    const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
    const preApproved = approvedBashPrefixes(root).some((prefix) => fixed.startsWith(prefix))
    rewriteTo(
      fixed,
      toolInput,
      preApproved ? 'allow' : 'ask',
      `Bare \`pnpm\` does not reliably run here (exit 127). Rewritten to:\n  ${fixed}`,
    )
  }

  deny(
    'Blocked: bare `pnpm` does not reliably run on this machine (it has measured absent,\n' +
      'present, and present-but-broken), so this can exit 127.\n\n' +
      'Use `npx --yes pnpm@10.34.5 <script>` instead — that is what every documented\n' +
      '`pnpm <script>` in this repo means, and what .claude/settings.json allows.\n\n' +
      'This is guarded rather than remembered because of where the failure shows up:\n' +
      'e2e/prepare.mjs shells out to `pnpm build`, so a bare pnpm kills the whole e2e\n' +
      'suite as "Timed out waiting 120000ms from config.webServer" with the real\n' +
      'status: 127 buried in a child process. See "The pnpm note" under "Commands" in\n' +
      'the root CLAUDE.md.\n\n' +
      'This one was DENIED rather than rewritten because the command contains a quote\n' +
      'or a heredoc, where a separator can hide inside a string — rewriting there could\n' +
      'run a command nobody typed. Retype it with the npx form.',
  )
})
