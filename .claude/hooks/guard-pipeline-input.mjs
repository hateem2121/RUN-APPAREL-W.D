#!/usr/bin/env node
/**
 * PreToolUse guard — refuse to run the asset pipeline on its own output.
 *
 * WHY THIS EXISTS. It is trap #1 in CLAUDE.md and it has already cost a session:
 *
 *   "Never run the pipeline on its own output. Meshopt quantizes vertex
 *    attributes; simplify-textured.ts bails to a position-only fallback when it
 *    sees them, so a second pass *silently* loses artwork protection and blames
 *    the wrong stage. Always start from the raw CLO export."
 *
 * The failure is silent — that is the whole problem. The run succeeds, the file
 * gets smaller, every gate passes, and the artwork protection was never applied.
 * `artworkAtRisk` cannot fire, because the fallback it reports on is the very
 * thing being taken. Nothing downstream notices. So this is enforced up front,
 * mechanically, rather than remembered.
 *
 * WHAT IT DOES *NOT* BLOCK — this half is load-bearing. CLAUDE.md's own
 * recommended diagnosis workflow reads FROM output/ on purpose:
 *
 *   pnpm pipeline render   out.glb              --out output/after
 *   pnpm pipeline compare  output/before output/after --out sheet.png
 *
 * `render`, `compare`, `textures`, `validate` and `placeholders` are read-only
 * with respect to geometry and are always allowed, wherever they read from. A
 * guard that blocked `compare output/before output/after` would block the exact
 * command the docs tell you to run, and would be turned off within a day — and a
 * gate the owner learns to override is worse than no gate (see the
 * findCrushedArtwork note in CLAUDE.md for the same reasoning).
 *
 * Only `optimize` and `merge` re-encode geometry, so only they can trip the
 * quantization trap, and only their INPUTS are checked. `--out output/...` is
 * the normal case and is never what is being complained about.
 */

const GEOMETRY_COMMANDS = new Set(['optimize', 'merge'])

/**
 * Flags that consume the NEXT token as their value. Enumerated from the parsers
 * in optimize.ts / merge-variants.ts / cli.ts rather than guessed: a flag missing
 * from this set would have its value mistaken for a positional input, which is
 * how a guard starts producing false blocks.
 */
const VALUE_FLAGS = new Set([
  '--out',
  '--expect',
  '--from-cms',
  '--max-texture',
  '--quality',
  '--artwork-quality',
  '--artwork-max-texture',
  '--simplify',
  '--simplify-error',
  '--uv-weight',
  '--normal-weight',
  '--gain',
  '--size',
  '--variant',
  '--views',
])

/** Anything that looks like an invocation of this repo's pipeline CLI. */
const PIPELINE_ENTRYPOINT = /(^|[/\s])(pipeline|run-asset-pipeline)$|cli\.ts$|asset-pipeline/

// Segmentation and tokenizing moved to ./shell.mjs on 2026-08-12, when this guard
// blocked a commit whose MESSAGE contained the words `pipeline optimize output/…`.
// Heredoc bodies were never stripped here, so prose describing the guard parsed as
// the command it describes. The sibling guard had just hit the identical bug; one
// shared parser is what stops the two answers drifting apart.
import { segments, tokenize } from './shell.mjs'

/**
 * True if `value` points inside a generated-output directory.
 *
 * Matched on path SEGMENTS, so `output/n001.glb`, `./output/x.glb`,
 * `tools/asset-pipeline/output/x.glb` and an absolute path all hit, while a file
 * innocently named `my-output.glb` does not.
 */
function isUnderOutput(value) {
  const parts = value.replace(/\\/g, '/').split('/')
  return parts.includes('output')
}

/**
 * Positional inputs for a geometry subcommand.
 *
 * `merge` takes `<file>=<VARIANT-ID>` tokens and splits on the LAST "=", because
 * a path may itself contain one — the same rule parseMergeArgs uses.
 */
function positionalInputs(tokens) {
  const inputs = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.startsWith('-')) {
      if (VALUE_FLAGS.has(token)) i++ // skip its value, notably --out
      continue
    }
    const eq = token.lastIndexOf('=')
    inputs.push(eq > 0 ? token.slice(0, eq) : token)
  }
  return inputs
}

function offendingInputs(command) {
  const found = []
  for (const segment of segments(command)) {
    if (!PIPELINE_ENTRYPOINT.test(segment) && !/\bpipeline\b/.test(segment)) continue
    const tokens = tokenize(segment)
    const at = tokens.findIndex((token) => GEOMETRY_COMMANDS.has(token))
    if (at === -1) continue
    // Guard against a false positive on e.g. `git commit -m "optimize"` — the
    // subcommand has to follow something that identifies the pipeline itself.
    const before = tokens.slice(0, at).join(' ')
    if (!/\bpipeline\b|cli\.ts|run-asset-pipeline|asset-pipeline/.test(before)) continue
    for (const input of positionalInputs(tokens.slice(at + 1))) {
      if (isUnderOutput(input)) found.push(input)
    }
  }
  return found
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

  const offenders = offendingInputs(command)
  if (offenders.length === 0) allow()

  deny(
    `Blocked: this runs the asset pipeline on its own output (${offenders.join(', ')}).\n\n` +
      'Meshopt quantizes vertex attributes, so simplify-textured.ts takes the ' +
      'position-only fallback and SILENTLY drops artwork protection — the run ' +
      'still succeeds and every gate still passes. See the root CLAUDE.md, "How work\n' +
      'is done here" (start the pipeline from the raw CLO export).\n\n' +
      'Start from the raw CLO export instead (raw/*.glb).\n' +
      'Reading from output/ is fine for render / compare / textures / validate — ' +
      'only optimize and merge are blocked, and only on their inputs.',
  )
})
