#!/usr/bin/env node
/**
 * Rebuild the codebase-memory-mcp index and re-seed the ADR store from docs/ADR.md.
 *
 * Why this exists: the ADR store lives inside the index database, and EVERY
 * `index_repository` run clears it — not just `delete_project`. Seeding it by hand
 * therefore lasts exactly until the next index. This script makes the pair atomic so
 * the decisions in docs/ADR.md are always what an agent sees.
 *
 *   pnpm index:ai          incremental re-index, then re-seed
 *   pnpm index:ai --cold   delete first, then full index, then re-seed
 *
 * Use --cold after editing .cbmignore: a normal re-index does not re-apply ignore
 * rules to files that have not changed, so the edit would silently do nothing.
 *
 * See docs/AI-TOOLING.md.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BIN = 'codebase-memory-mcp';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cold = process.argv.includes('--cold');

/** Run a cli tool and return its parsed JSON result (the last JSON line of stdout). */
function cli(tool, args) {
  const flags = Object.entries(args).flatMap(([k, v]) => [`--${k}`, v]);
  let out;
  try {
    out = execFileSync(BIN, ['cli', tool, ...flags], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `${BIN} is not on your PATH. Install it once per machine:\n` +
          `  npm install -g codebase-memory-mcp@0.9.0\n` +
          `See docs/AI-TOOLING.md.`,
      );
    }
    throw new Error(`${tool} failed: ${err.stderr?.toString().trim() || err.message}`);
  }
  // The binary interleaves `level=…` log lines with the JSON result.
  const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  if (!line) throw new Error(`${tool} returned no JSON result`);
  return JSON.parse(line);
}

// The project name is derived from the absolute path, so it differs per machine.
// Resolve it by matching root_path rather than hard-coding it.
function resolveProjectName() {
  const { projects = [] } = cli('list_projects', {});
  return projects.find((p) => p.root_path === repoRoot)?.name ?? null;
}

const adr = readFileSync(join(repoRoot, 'docs/ADR.md'), 'utf8');

if (cold) {
  const name = resolveProjectName();
  if (name) {
    cli('delete_project', { project: name });
    console.log(`deleted existing index (${name})`);
  }
}

const result = cli('index_repository', { 'repo-path': repoRoot, mode: 'full' });
console.log(`indexed: ${result.nodes} nodes / ${result.edges} edges`);

const project = resolveProjectName();
if (!project) throw new Error(`indexed, but no project matches ${repoRoot}`);

cli('manage_adr', { project, mode: 'update', content: adr });

// Re-read rather than trust the write: this is the step that silently regresses.
const { sections = [] } = cli('manage_adr', { project, mode: 'sections' });
if (sections.length === 0) throw new Error('ADR re-seed reported success but read back empty');
console.log(`ADR re-seeded from docs/ADR.md: ${sections.length} sections`);
console.log(`project: ${project}`);
