# AI tooling

What is wired up for AI coding agents working on this repository, and how to use
it. Nothing here is required to build, test or deploy the project — CI does not
depend on any of it.

---

## Which memory wins

An audit on 2026-08-06 found **three** systems each behaving as though it were the
project's memory, with no stated order between them. That is not a tidiness
complaint: when two of them disagree, an agent picks one, and which one it picks is
arbitrary. The order below is now the rule.

| Rank | Store | What it is for | Who writes it |
|---|---|---|---|
| **1** | **`CLAUDE.md`** | **The authority.** Traps that have cost a session, and the reasoning behind them. If anything here conflicts with anything below, this wins. | Humans, deliberately |
| 2 | `docs/` (`HARDENING-LOG`, `RUNBOOK`, `SESSION-*`, `DESIGN`, this file) | The long form behind `CLAUDE.md`'s one-liners. Never contradicts it. | Humans |
| 3 | codebase-memory ADR store | A machine-readable **mirror of `CLAUDE.md`**, so graph queries return the same rules. Not a separate opinion — `scripts/index-ai.mjs` re-seeds it verbatim and re-reads to prove it landed. | `pnpm index:ai` |
| 4 | The agent's own per-project memory dir, and any session-memory plugin | **Search over past sessions. Nothing more.** Useful for "did we try this already?" Never a source of truth about how the system behaves. | Agents, automatically |

**There is currently no session-memory plugin installed, and that is deliberate.**
`claude-mem` was tried and removed on 2026-08-06. It had produced **zero
observations and zero session summaries** in its entire database — not just for this
project — because it shells out to a `claude` CLI that is not installed on the
owner's machine (Claude Code runs from the desktop app). Meanwhile it held a queue
of 354 jobs it could never process, retried every ~35 s, and occupied 444 MB.

It was fixable: a `claude` binary exists inside the app bundle at
`~/Library/Application Support/Claude-Work/claude-code/<version>/claude.app/Contents/MacOS/claude`,
and `CLAUDE_CODE_PATH` in `~/.claude-mem/settings.json` would have pointed at it.
Recorded so the option is known. It was removed anyway because rank 4 is the least
load-bearing row in this table, and `docs/SESSION-*.md` already do that job by hand
at rank 2. Full detail and the undo path:
`~/.claude/backups/RESTORE-2026-08-06-tooling-plan.md`.

**The rule for ranks 3 and 4: they are indexes, not authorities.** Anything an agent
reads there and intends to act on must be confirmed against `CLAUDE.md` or the code.
A recalled note describes what was true when it was written; several things in this
repo have been diagnosed wrongly and corrected later (the CSP cause on 2026-08-05,
the `no-transform` claim), and the correction only ever lands in ranks 1–2.

This is the same principle the repo already applies to derived documents: one
maintained file, no second copy that gets to define anything. See the note in
`scripts/index-ai.mjs`, and the header of `apps/viewer/src/styles/tokens.css`.

---

## 1. codebase-memory-mcp (code intelligence)

An MCP server that parses the repository with tree-sitter into a queryable graph
of modules, functions and their call/usage edges. An agent can ask "where is
variant validation done?" and get the answer without reading every file.

**Registered in `.mcp.json` at the repo root**, so any agent that reads
project-scoped MCP config (Claude Code, and others it auto-detects) picks it up
on open.

```jsonc
// .mcp.json
{
  "mcpServers": {
    "codebase-memory": {
      "command": "codebase-memory-mcp",
      "args": []
    }
  }
}
```

### One-time install (required)

`.mcp.json` invokes the binary by name, so it must be on your `PATH`. Install it
once per machine, at the pinned version:

```bash
npm install -g codebase-memory-mcp@0.9.0
codebase-memory-mcp --version   # expect: codebase-memory-mcp 0.9.0
```

Upstream also ships a one-line installer that fetches the same pinned binary
straight from GitHub Releases into `~/.local/bin` (SHA-256 verified), skipping
the npm wrapper — equivalent for our purposes, since `.mcp.json` only needs the
binary on `PATH`:

```bash
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash
```

**This is a ~270 MB download.** The npm package is a thin wrapper whose
`postinstall` pulls a platform-specific static binary from GitHub Releases, and
on a cold cache that takes minutes, not seconds.

That size is exactly why the config does **not** use `npx -y codebase-memory-mcp`,
which would otherwise be the zero-setup option: `npx` re-materializes the package
when its cache is cold, so the download would run *during MCP server startup* and
blow past the agent's init timeout. The server would look broken rather than slow.
A one-time explicit install is the honest trade — the failure mode becomes a clear
`command not found` instead of a silent hang.

If the server fails to start, check `codebase-memory-mcp --version` first; a
missing global install is the likeliest cause.

Restart your agent after installing — project MCP config is read at startup, so
editing `.mcp.json` in a running session does not register the server.

### Indexing

The index is **not** built automatically and is **not** committed — it lives in
`~/.cache/codebase-memory-mcp` on each machine. Build it once per clone:

```bash
pnpm index:ai
```

That wraps `index_repository` **and** re-seeds the ADR store from `CLAUDE.md`,
which is the only combination that leaves the index in a correct state — see the
two traps below. After editing `.cbmignore`, use the cold path instead:

```bash
pnpm index:ai --cold
```

This repository indexes in ~0.4 s. Node/edge counts, each measured on the tree of
the day: **1,810 / 3,141 (2026-08-06)**, 1,446 / ~2,550 (2026-08-01, after PRs
#14/#15), 1,536 / 2,306 (2026-07-27, a smaller tree). The graph tracks the repo, so
treat these as a growth curve rather than a target — what matters is that a re-index
does not *shrink* it unexpectedly. The project name derives from the path —
`Users-hateemjamshaid-Sites-Model-Viewer-main` on the owner's laptop, something else
elsewhere; `pnpm index:ai` resolves it automatically, and `cli list_projects` prints
it. Every query tool needs it as `--project`.

Re-run after large refactors. `cli detect_changes` reports drift, and a stale
index is the main failure mode worth knowing about: it answers confidently from
the old structure. When in doubt, re-index — it costs a second.

If you index by hand, know the two traps `pnpm index:ai` exists to absorb:

⚠️ **Re-indexing an existing project is incremental**, and does *not* re-apply
ignore rules to files that haven't changed. Edit `.cbmignore` and a plain re-index
will report success and change nothing. You must `delete_project` first — that is
what `--cold` does.

⚠️ **The ADR store is scoped to the indexed commit.** Measured 2026-08-01 in an
isolated throwaway repo, three trials each:

| What you do | ADR |
|---|---|
| Re-index with HEAD unchanged | **survives** |
| Commit (HEAD moves), then re-index | **wiped** |
| `delete_project`, then re-index | **wiped** |

Since you normally re-index *because* the code changed, in practice it is gone
almost every time you would care. `CLAUDE.md` is the durable copy; `pnpm index:ai`
re-seeds from it and fails loudly if the read-back comes up empty.

Use the installed binary, **not** `npx` — for the same reason `.mcp.json` doesn't
(see above): `npx` re-materializes ~270 MB on a cold cache.

### Useful calls

| Tool | What it answers |
|---|---|
| `search_graph --project P --query "..."` | Ranked symbols matching a concept |
| `search_code --project P --pattern "..."` | Literal pattern, with file + line hits |
| `get_architecture --project P` | High-level module/dependency overview |
| `trace_path --project P` | Call path between two symbols |
| `detect_changes --project P` | What drifted since the last index |
| `index_status --project P` | Freshness and node/edge counts |
| `manage_adr --project P --mode get` | The recorded architecture decisions |

Note the arguments are `repo_path` / `pattern` / `project` — passing `path` or
omitting `project` fails with a validation error, not a useful message.

Two caveats about what the graph will and won't answer:

- **`search_graph` can't see config files.** Its BM25 mode filters out
  File/Folder/Module/Variable labels, and config keys are Variables — so the
  `wrangler.jsonc` bindings are indexed but not *searchable*. Reach them
  structurally instead:
  `query_graph --query "MATCH (v:Variable) WHERE v.file_path CONTAINS 'wrangler' RETURN v.file_path, v.name"`
- **The `Route` list is not an API inventory — it contains none of our endpoints.**
  Traced file-by-file, re-checked 2026-08-01 after PRs #14/#15. All 17:

  | Origin | Count | Examples |
  |---|---|---|
  | Test-file string literals | 8 | `/a/b/c`, `/N001/Navy` (`slugs.test.ts`); `/media/x.webp`, `/media/n001.glb` (`projectViewer.test.ts`) |
  | A literal in normal source | 1 | `/n001/navy` in `packages/shared/src/slugs.ts` |
  | **Outbound** calls to the CMS API | 6 | `/api/media`, `/api/products/:id`, `/api/raw-uploads` — made *by* `apps/shrink`, not served here |
  | Infra URLs in CI YAML | 2 | `.github/workflows/{ci,uptime}.yml` |

  **Zero** of the five endpoints this app actually defines
  (`apps/cms/src/endpoints/{events,health,pipelinePlan,projectViewer,publicViewer}.ts`)
  appear. Most Route nodes carry an empty `file_path`, so they cannot even be
  attributed from the graph. Upstream extraction behaviour; no config fixes it.
  Read `apps/cms/src/endpoints/` for the real list.

### Index tuning

Two committed config files shape what gets indexed. Both were added 2026-08-01
after measuring what the default index actually contained.

**`.cbmignore`** (gitignore syntax) excludes `apps/cms/src/migrations/*.json`. Those
six `payload migrate:create` schema snapshots generate **1,252 nodes** of pure
generated-schema noise. Re-measured 2026-08-01 on the post-merge tree by indexing it
twice: **2,698 nodes without it, 1,446 with — a 46% reduction**, and 1,255 of the
1,633 Variable nodes were migration JSON. (The 1,252-node saving has held constant
across every measurement; the percentage only moves as the rest of the repo grows.)

Excluding them costs nothing. Verified repo-wide: **no file references any of the six
`.json` snapshots** (`migrations/index.ts` imports only the `.ts` modules), so not a
single edge is lost. The migration *logic* lives in those `.ts` files and stays fully
indexed. Removing the snapshots also fixed a bookkeeping quirk where the `.ts`
migrations had no File node of their own.

Note `.cbmignore` can only **narrow**, never re-include: a `!negation` for a file
that `.gitignore` already excludes does **not** bring it back (tested 2026-08-01).

**Do not delete `.cbmignore` to "index more".** It halves the graph without losing
a single edge of value. If you do change it, re-index with `pnpm index:ai --cold` —
an incremental run will not re-apply the rules and the edit will appear to do nothing.

**`.codebase-memory.json`** maps `.jsonc` → `json`, which is the only reason the
three `wrangler.jsonc` files and `wrangler.migrate.jsonc` — the D1/R2 bindings,
routes, custom domains and the `workers_dev` cutover state — are visible at all.

What remains deliberately unindexed: `package.json`, `tsconfig.json`,
`package-lock.json` and `yarn.lock` are skipped **by name**, so no config can pull
them in. Proven 2026-08-01 by indexing a throwaway repo containing six
byte-identical JSON files differing only in filename: `aacontrol.json` and
`zzcontrol.json` were indexed, the four above were not. `.gitignore`/`.dockerignore`,
the binary `studio-soft.hdr`, and `apps/viewer/public/_redirects` (extensionless) are
also absent. None of this is worth working around.

### Architecture decisions (ADR)

The server stores a per-project ADR document, readable with `manage_adr --mode get`.
`pnpm index:ai` seeds it from **`CLAUDE.md`**, so an agent whose client surfaces
`manage_adr` starts with the same brief a human is told to read first.

**`CLAUDE.md` is the source of truth.** Edit there. The copy inside the index is
disposable — it is scoped to the indexed commit and is lost as soon as HEAD moves
(see the table above), which is why `scripts/index-ai.mjs` re-seeds it as part of the
same command and verifies the read-back rather than trusting the write.

It seeds from `CLAUDE.md` rather than a purpose-written summary because that was
tried and failed. A hand-written `docs/ADR.md` digest of `docs/HARDENING-LOG.md` and
`docs/RAW-UPLOAD-PIPELINE.md` was added on 2026-08-01 and contradicted `CLAUDE.md`
the same day: it still described the artwork issue as undiagnosed and recommended
`--keep-transparency`, which `CLAUDE.md` warns against. A derived summary drifts from
the moment it is written. It was deleted; one maintained file, no second copy.

### Scope note

This is a **small** repository (~14.6k lines across 122 TypeScript files), and an
agent can read it directly without help. The graph earns its keep mainly on
impact analysis ("what touches `buildVariantId`?") rather than on context saving.
Keep an eye on whether it actually gets used. To remove it: delete `.mcp.json`,
`.cbmignore`, `.codebase-memory.json`, `scripts/index-ai.mjs` and the `index:ai`
script from `package.json`, then `npm uninstall -g codebase-memory-mcp` and
`rm -rf ~/.cache/codebase-memory-mcp` to reclaim the ~270 MB binary and the index.
Nothing else in the repo depends on any of it.

### Verified behaviour

Checked against this repo on 2026-07-27 and re-verified 2026-08-01, so the claims
here are measured rather than quoted from upstream:

- MCP handshake over stdio succeeds; server reports `codebase-memory-mcp 0.9.0`,
  protocol `2024-11-05`
- **8 tools are exposed at startup** — `index_repository`, `search_graph`,
  `search_code`, `query_graph`, `trace_path`, `get_code_snippet`,
  `get_architecture`, `get_graph_schema`. Upstream advertises 14–15; the rest
  (`list_projects`, `index_status`, `detect_changes`, `manage_adr`, …) are
  available through the `cli` subcommand but are not in the startup tool list.
  Re-verified 2026-07-27: the server reports `capabilities.tools.listChanged:
  false` and the list is still 8 on a second `tools/list` after settling, so it
  never expands. Some agent clients wrap the `cli` subcommand and *surface* the
  extra tools anyway — if your client shows ~14, that is the client, not this
  registration, and the 8 above is still what `.mcp.json` yields.
  **Re-confirmed 2026-08-01 by a direct stdio handshake: still exactly 8**, while
  Claude Code's tool list showed 14 — the wrapping described above, as predicted
- Full index of this repo: **~0.4s**, 1,446 nodes / ~2,550 edges (2026-08-01, after
  the index tuning above and PRs #14/#15; it was 2,698 / 3,943 without `.cbmignore`,
  and 1,536 / 2,306 when first measured on 2026-07-27 on a smaller tree)
- Warm query: **~0.07s**

### Full-suite verification, 2026-08-01

The whole CI `verify` chain was run locally, last on the post-merge tree (PRs
#14/#15) under Node 24.18.1 — the same major CI pins. **pnpm is not on this machine's
`PATH`**, but every dependency and Playwright's browsers are, so
`npx --yes pnpm@10.33.0 <script>` runs the real commands without installing anything
globally.

| Gate | Result |
|---|---|
| `typecheck` | ✅ 5/5 packages clean |
| `test` | ✅ 255/255 (27 shared · 94 pipeline · 26 viewer · 11 shrink · 97 cms) |
| `seed:assets` | ✅ variants match expected CMS variantIds |
| `build` | ✅ viewer + cms (Next 16 / Turbopack) + shrink |
| `test:e2e` | ✅ 10/10 including the WebGL KHR-variant check |
| `audit-ci` | ✅ passed (2 high advisories, allowlisted in `audit-ci.jsonc`) |
| `lhci autorun` | ✅ all assertions passed |
| gitleaks | ✅ no leaks, 81 commits (run via the official Docker image) |
| `index:ai` / `--cold` | ✅ both, through pnpm |

Run `pnpm install --frozen-lockfile` after any merge that moves `pnpm-lock.yaml` —
otherwise new deps are missing and the failure looks like a code error. It is exempt
from the `minimumReleaseAge` cooldown, so it is always safe.

**Node version note.** CI pins Node 24, and local development should match it
(`brew link --overwrite --force node@24`). From Node 25 the
experimental Web Storage API is on by default, defining a global `localStorage` that
evaluates to `undefined` without `--localstorage-file` and suppressing the one jsdom
would install. That used to fail 6 tests in `apps/viewer/src/lib/theme.test.ts` while
CI stayed green, because `engines` allows `>=24`.

Fixed by `apps/viewer/vitest.setup.ts`, which installs jsdom's real Storage onto
`globalThis` unconditionally — so Node 24 and Node 26 run the identical
implementation and a local pass means what CI's pass means. Verified on both
v24.18.1 (CI's exact version, via Docker) and v26.5.1. Two neater-looking fixes do
not work and are documented in that file: Vitest 4.1.10 silently ignores
`poolOptions.forks.execArgv`, and a `NODE_OPTIONS` in the `test` script would leave a
bare `vitest run` (and IDE Vitest integrations) still broken.

Still worth doing: **use Node 24 locally**, matching CI and the current Active LTS.

### Hardening — where `CBM_ALLOWED_ROOT` lives

`CBM_ALLOWED_ROOT=<absolute path>` restricts what the indexer is allowed to read.
It is not in `.mcp.json` because the value is machine-specific.

Since 2026-08-06 it belongs in **`.claude/settings.local.json`**, which is
gitignored, so each machine sets its own. It cannot go in the shared
`.claude/settings.json`: an absolute path is not portable, and settings files do
**not** expand `${CLAUDE_PROJECT_DIR}` — or any variable — inside the `env` block
(checked against the Claude Code settings reference on 2026-08-06; the expansion
exists for *hook commands*, which is why the guard hook below can be shared and
this cannot).

```jsonc
// .claude/settings.local.json — per machine, not committed
{ "env": { "CBM_ALLOWED_ROOT": "/absolute/path/to/this/repo" } }
```

### Upgrading

`0.9.0` (published 2026-07-08) is the current **stable** release. Checked 2026-08-01
against the full release list, not just `latest`: a prerelease **`v0.9.1-rc.1`**
exists (2026-07-30). Upstream describes it as rearchitecting the backend around a
coordination daemon — "deeper than a normal point release" — and asks for feedback
before the final tag. **Stay on 0.9.0**; there is no stable upgrade to take.

**`.mcp.json` cannot pin the version.** That file invokes the binary by bare name
(`"args": []`), so whatever is on your `PATH` is what runs — for the MCP server and
for `pnpm index:ai` alike. A later `npm install -g codebase-memory-mcp` would
silently move the whole project to a new build, and the first symptom is a graph
that answers differently. Dependabot does not watch any of this.

**Since 2026-08-06 the pin is enforced in `scripts/index-ai.mjs`** instead, by a
`PINNED_VERSION` constant asserted against `codebase-memory-mcp --version` before
anything is indexed. A mismatch refuses to run and names both directions of the
fix. It is checked first, and deliberately: the failure it guards against is
silent, so it has to present as a message rather than as a subtly different answer
three questions later.

That is a *local* guard, not a global one — it cannot stop the MCP server itself
from starting on a different build, because nothing in the MCP protocol lets a
project demand a version. It does mean the mismatch is caught the next time anyone
re-indexes, which in practice is the same session.

To bump: change `PINNED_VERSION`, run `pnpm index:ai --cold`, and re-measure the
node/edge counts above in the same commit — they are claims about a specific build.

---

## 2. @google/model-viewer (already a dependency)

The `<model-viewer>` web component is what renders the garment. It was already
installed and is on the latest release:

- **Version:** `4.3.1` in `apps/viewer/package.json` (latest on npm at the time
  of writing — nothing to upgrade)
- **Loaded from:** `apps/viewer/src/components/Stage.tsx`, dynamically imported
  so the ~300 KB component stays out of the initial bundle and a load failure
  degrades to the poster instead of breaking the page
- **Typed by:** the package's own types, with the attributes we set declared in
  `apps/viewer/src/vite-env.d.ts`
- **Lighting:** a custom baked `studio-soft.hdr` in `apps/viewer/public/env`
  paired with `tone-mapping="neutral"`, because the built-in neutral scene
  renders technical fabric flat

Colourway switching goes through the `KHR_materials_variants` extension baked
into the merged GLB by `tools/asset-pipeline` — that coupling is what
`pnpm pipeline validate --strict` protects, and what `apps/viewer/e2e/webgl.spec.ts`
asserts at runtime.

Upstream docs: <https://modelviewer.dev> · repo: <https://github.com/google/model-viewer>

---

## 3. claude-cookbooks (reference, not vendored)

<https://github.com/anthropics/claude-cookbooks> — Anthropic's collection of
Jupyter notebooks showing Claude API patterns (tool use, RAG, classification,
sub-agents, prompt caching, vision, evals).

**It is deliberately not checked into this repository.** It is a Python notebook
collection with no npm package and nothing to install, and this project makes no
LLM calls at runtime — there is no `openai`, `@anthropic-ai/*` or `ai` dependency
anywhere in the workspace. Vendoring it would add a Python toolchain and a large
notebook tree to a TypeScript/Cloudflare monorepo, and put files in front of
`gitleaks`, `audit-ci` and the asset pipeline that have nothing to do with the
product.

Read it where it lives. If the project ever grows a real LLM feature — auto
alt-text for poster images, buyer-facing search over the catalogue, garment
description drafting — the relevant starting points are:

| Cookbook area | Would apply to |
|---|---|
| Vision / multimodal | Generating alt text from poster renders |
| Tool use | Letting an assistant query the public viewer API |
| Classification | Auto-tagging products by category or fabric |
| Prompt caching | Keeping per-request cost down on the catalogue prompt |

At that point the dependency to add is `@anthropic-ai/sdk` in the CMS worker, and
the cookbook is the reference for how to call it — not a thing to copy wholesale.

---

## 4. Project agent config (`.claude/`)

| File | Committed | What it does |
|---|---|---|
| `launch.json` | yes | Dev-server definitions for viewer (5173) and cms (3000). Invokes pnpm via `npx --yes pnpm@10.33.0`, because pnpm is not necessarily on `PATH` — see the note under "Full-suite verification". |
| `settings.json` | yes | Permission allowlist for read-only commands, plus the guard hook below. |
| `settings.local.json` | **no** (gitignored) | `CBM_ALLOWED_ROOT`. Machine-specific; see above. |
| `hooks/guard-pipeline-input.mjs` | yes | The guard below. |
| `skills/` | yes | Four vendored third-party skills, pinned to a commit. Provenance, licences, the reason for each, why a fifth was dropped, and a review date are in `.claude/skills/README.md`. |

### The pipeline guard hook

A `PreToolUse` hook that refuses to run `pipeline optimize` or `pipeline merge`
on a file under `output/` — trap #1 in `CLAUDE.md`, mechanically enforced:

> Meshopt quantizes vertex attributes; `simplify-textured.ts` bails to a
> position-only fallback when it sees them, so a second pass *silently* loses
> artwork protection and blames the wrong stage.

It exists because that failure is **silent and self-concealing**: the run
succeeds, the file shrinks, and `artworkAtRisk` cannot report the fallback,
because taking the fallback is the thing that happened. Nothing downstream
notices. Remembering is not a control; this is.

**What it deliberately does not block.** `render`, `compare`, `textures`,
`validate` and `placeholders` are always allowed, wherever they read from —
because `CLAUDE.md`'s own diagnosis workflow reads out of `output/` on purpose:

```bash
pnpm pipeline compare output/before output/after --out sheet.png
```

Only the two commands that re-encode geometry are gated, and only on their
*inputs*; `--out output/…` is the normal case and is never what is complained
about. A guard that blocked the documented workflow would be switched off within
a day, and a gate the owner learns to override is worse than no gate — the same
reasoning that keeps `findCrushedArtwork` a warning rather than a blocker.

Verified 2026-08-06 against 17 commands — 5 that must block (including a
`&&`-chained one and an `npx --yes pnpm@…` form) and 12 that must not (including
every documented workflow line and `git commit -m "optimize output/foo"`, to
prove it does not fire on the word alone). The `VALUE_FLAGS` set in the script is
enumerated from the real parsers so that `--out`'s value is never mistaken for an
input; if a new value-taking flag is added to the CLI, add it there too.
