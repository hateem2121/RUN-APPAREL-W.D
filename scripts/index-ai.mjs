#!/usr/bin/env node
/**
 * Rebuild the codebase-memory-mcp index and re-seed the ADR store from CLAUDE.md.
 *
 * Why this exists: the ADR store lives inside the index database and is scoped to the
 * indexed commit. It survives a re-index at the same HEAD, but is lost as soon as HEAD
 * moves — and re-indexing after committing is exactly the normal case. `delete_project`
 * clears it too. Seeding by hand therefore lasts only until your next commit. This
 * script makes the pair atomic so CLAUDE.md is always what an agent actually sees.
 *
 * It seeds from CLAUDE.md rather than a separate summary on purpose. A hand-written
 * digest of the docs was tried first and contradicted CLAUDE.md within a day — it
 * still called the artwork issue undiagnosed and recommended `--keep-transparency`,
 * which CLAUDE.md now warns against. One maintained file, no second copy to drift.
 *
 *   pnpm index:ai          incremental re-index, then re-seed
 *   pnpm index:ai --cold   delete first, then full index, then re-seed
 *
 * Use --cold after editing .cbmignore: a normal re-index does not re-apply ignore
 * rules to files that have not changed, so the edit would silently do nothing.
 *
 * See docs/AI-TOOLING.md.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BIN = 'codebase-memory-mcp'

/**
 * The version this repo's measurements were taken against, asserted below.
 *
 * `.mcp.json` invokes the binary by BARE NAME (`"args": []`), so whatever is on
 * PATH is what both the MCP server and this script run. There is no pin there and
 * there cannot be one — so a later `npm install -g codebase-memory-mcp` silently
 * moves the whole project to a different build, and the first sign of it is a
 * graph that answers differently. Dependabot does not watch any of this.
 *
 * docs/AI-TOOLING.md states which numbers were measured on which build. 0.9.0 ->
 * 0.11.0 (2026-09-26, owner-approved) changed three of them on the same tree: startup
 * tools 8 -> 17, edges 18,088 -> 22,838 (a new CALL_REFERENCE edge class), and the cli
 * output contract (see `cli` below). A different build invalidates those numbers
 * without changing a single line of this repo.
 *
 * Bumping is a deliberate act: change this constant, re-run `pnpm index:ai --cold`,
 * and re-measure the numbers in docs/AI-TOOLING.md in the same commit.
 */
const PINNED_VERSION = '0.11.0'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const cold = process.argv.includes('--cold')

/**
 * Run a cli tool and return its structured result.
 *
 * ⚠️ 0.11 CHANGED THE CONTRACT (measured 2026-09-26). Arguments are one JSON object, not
 * `--key value` flags, and a tool answers in an indented TEXT tree unless asked otherwise:
 * `--json` prints the MCP result envelope, and tools that take `format` put the data in
 * `structuredContent` only with `format: 'json'`. Under the 0.9 parser below every call
 * would have thrown "returned no JSON result".
 */
function cli(tool, args) {
  let out
  try {
    out = execFileSync(BIN, ['cli', '--json', tool, JSON.stringify(args)], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `${BIN} is not on your PATH. Install it once per machine:\n` +
          `  npm install -g codebase-memory-mcp@${PINNED_VERSION}\n` +
          `See docs/AI-TOOLING.md.`,
      )
    }
    throw new Error(`${tool} failed: ${err.stderr?.toString().trim() || err.message}`)
  }
  // Last `{` line, in case a log line ever reaches stdout ahead of the envelope.
  const line = out
    .trim()
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .pop()
  if (!line) throw new Error(`${tool} returned no JSON result`)
  const envelope = JSON.parse(line)
  if (envelope.isError) throw new Error(`${tool} failed: ${envelope.content?.[0]?.text}`)
  // A tool left on its default `format: 'tree'` answers in text only — refuse that
  // loudly rather than read `undefined` counts as an empty project.
  if (!envelope.structuredContent) throw new Error(`${tool} returned no structured result`)
  return envelope.structuredContent
}

/**
 * Refuse to run against an unpinned build.
 *
 * Checked FIRST, before indexing, because the failure this guards against is
 * silent: a newer binary indexes happily and answers confidently from a different
 * graph. A wrong version must present as a clear message here, not as a subtly
 * different answer three questions later.
 */
function assertPinnedVersion() {
  let reported
  try {
    reported = execFileSync(BIN, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `${BIN} is not on your PATH. Install it once per machine:\n` +
          `  npm install -g codebase-memory-mcp@${PINNED_VERSION}\n` +
          `See docs/AI-TOOLING.md.`,
      )
    }
    throw new Error(
      `could not read ${BIN} --version: ${err.stderr?.toString().trim() || err.message}`,
    )
  }

  // Reported as "codebase-memory-mcp 0.11.0" — match the version token, not the
  // whole string, so a change to the banner does not read as a version drift.
  const found = reported.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?/)?.[0]
  if (found !== PINNED_VERSION) {
    throw new Error(
      `${BIN} on PATH is ${found ?? `unparseable ("${reported}")`}, but this repo is pinned to ${PINNED_VERSION}.\n` +
        `\n` +
        `  .mcp.json runs the binary by bare name, so the MCP server your agent talks to is this same\n` +
        `  build — the graph it answers from would not be the one docs/AI-TOOLING.md measured.\n` +
        `\n` +
        `  To go back:   npm install -g codebase-memory-mcp@${PINNED_VERSION}\n` +
        `  To bump:      change PINNED_VERSION in this file, run \`pnpm index:ai --cold\`, and re-measure\n` +
        `                the node/edge counts and the startup tool list in docs/AI-TOOLING.md — in the\n` +
        `                same commit. The numbers there are claims about a specific build.`,
    )
  }
}

// The project name is derived from the absolute path, so it differs per machine.
// Resolve it by matching root_path rather than hard-coding it.
function resolveProjectName() {
  const { projects = [] } = cli('list_projects', { format: 'json' })
  return projects.find((p) => p.root_path === repoRoot)?.name ?? null
}

assertPinnedVersion()

const adr = readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf8')

if (cold) {
  const name = resolveProjectName()
  if (name) {
    cli('delete_project', { project: name })
    console.log(`deleted existing index (${name})`)
  }
}

const result = cli('index_repository', { repo_path: repoRoot, mode: 'full' })
console.log(`indexed: ${result.nodes} nodes / ${result.edges} edges`)

const project = resolveProjectName()
if (!project) throw new Error(`indexed, but no project matches ${repoRoot}`)

cli('manage_adr', { project, mode: 'update', content: adr, format: 'json' })

// Re-read rather than trust the write: this is the step that silently regresses.
const { sections = [] } = cli('manage_adr', { project, mode: 'sections', format: 'json' })
if (sections.length === 0) throw new Error('ADR re-seed reported success but read back empty')
console.log(`ADR re-seeded from CLAUDE.md: ${sections.length} sections`)
console.log(`project: ${project}`)
