# AI tooling

What is wired up for AI coding agents working on this repository, and how to use
it. Nothing here is required to build, test or deploy the project — CI does not
depend on any of it.

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

That wraps `index_repository` **and** re-seeds the ADR store from `docs/ADR.md`,
which is the only combination that leaves the index in a correct state — see the
two traps below. After editing `.cbmignore`, use the cold path instead:

```bash
pnpm index:ai --cold
```

This repository indexes in ~0.3 s (~1,246 nodes / ~2,090 edges, measured
2026-08-01). The project name derives from the path —
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

⚠️ **Every re-index wipes the ADR store** — `index_repository` clears it, not just
`delete_project`. A hand-seeded ADR therefore survives only until the next index.
`docs/ADR.md` is the durable copy; `pnpm index:ai` re-seeds from it and fails loudly
if the read-back comes up empty.

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
- **The `Route` list is not an API inventory.** Of 14 Route nodes, roughly 9 are
  string literals lifted out of test files (`/a/b/c`, `/media/x.webp`,
  `https://viewer.wear-run.help`). Only ~4 are real endpoints. This is upstream
  extraction behaviour and no config fixes it — read `apps/cms/src/endpoints/`
  for the real list.

### Index tuning

Two committed config files shape what gets indexed. Both were added 2026-08-01
after measuring what the default index actually contained.

**`.cbmignore`** (gitignore syntax, applied after the `.gitignore` hierarchy)
excludes `apps/cms/src/migrations/*.json`. Those six `payload migrate:create`
schema snapshots were generating **1,252 of the graph's 2,365 nodes — 53% of the
index and 83% of all Variable nodes** — with no query value. Excluding them costs
nothing: nothing in the repo imports them (`migrations/index.ts` imports only the
`.ts` modules), and the migration *logic*, including the hand-written `-- BACKFILL`
blocks, lives in those `.ts` files and stays fully indexed. Removing them also
fixed a bookkeeping quirk where the `.ts` migrations had no File node of their own.

**Do not delete `.cbmignore` to "index more".** It halves the graph without losing
a single edge of value. If you do change it, re-index with `pnpm index:ai --cold` —
an incremental run will not re-apply the rules and the edit will appear to do nothing.

**`.codebase-memory.json`** maps `.jsonc` → `json`, which is the only reason the
three `wrangler.jsonc` files and `wrangler.migrate.jsonc` — the D1/R2 bindings,
routes, custom domains and the `workers_dev` cutover state — are visible at all.

What remains deliberately unindexed: `package.json`, `tsconfig.json`,
`package-lock.json` and `yarn.lock` are on a **hardcoded** skip list inside the
binary, so no config can pull them in. `.gitignore`/`.dockerignore`, the binary
`studio-soft.hdr`, and `apps/viewer/public/_redirects` (extensionless) are also
absent. None of this is worth working around.

### Architecture decisions (ADR)

The server stores a per-project ADR document, readable with `manage_adr --mode get`.
It records the decisions that cost real time to reach — Meshopt decoder wiring,
texture-aware decimation, the `storage-r2` patch guards, the D1 migration defects,
worker isolation, and the open artwork issue — so a new session starts knowing them
instead of re-deriving them from `docs/`.

**`docs/ADR.md` is the source of truth.** Edit there. The copy inside the index is
disposable: it is cleared by *every* re-index, which is why `scripts/index-ai.mjs`
re-seeds it as part of the same command and verifies the read-back rather than
trusting the write. Seeding it by hand works, but lasts only until the next index.

The per-topic documents in `docs/` remain the full account; `docs/ADR.md` is the
summary that points back at them.

### Scope note

This is a **small** repository (~11.2k lines across 106 TypeScript files), and an
agent can read it directly without help. The graph earns its keep mainly on
impact analysis ("what touches `buildVariantId`?") rather than on context saving.
Keep an eye on whether it actually gets used. To remove it: delete `.mcp.json`,
`.cbmignore`, `.codebase-memory.json`, `scripts/index-ai.mjs` and the `index:ai`
script from `package.json`, then `npm uninstall -g codebase-memory-mcp` and
`rm -rf ~/.cache/codebase-memory-mcp` to reclaim the ~270 MB binary and the index.
Keep `docs/ADR.md` — it is prose about the project, useful with or without the tool.
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
- Full index of this repo: **~0.3s**, 1,215 nodes / 2,051 edges (2026-08-01, after
  the index tuning above; it was 2,365 / 3,326 before excluding the migration
  snapshots, and 1,536 / 2,306 when first measured on 2026-07-27)
- Warm query: **~0.07s**

### Optional hardening

`CBM_ALLOWED_ROOT=<absolute path>` restricts what the indexer is allowed to read.
It is not set in `.mcp.json` because the value is machine-specific, but it is
worth adding to your local agent config if you want the indexer confined to this
project.

### Upgrading

`0.9.0` is the current upstream release (published 2026-07-08; checked 2026-08-01)
— there is nothing to upgrade to.

**The version is *not* pinned by `.mcp.json`.** That file invokes the binary by
bare name (`"args": []`), so whatever is on your `PATH` is what runs. The only pin
is the `@0.9.0` in the install command above, which is a convention, not an
enforced constraint — a later `npm install -g codebase-memory-mcp` silently moves
the whole project to a new build. Bump deliberately, verify with
`codebase-memory-mcp --version`, and re-index afterwards. Dependabot does not
watch any of this.

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
