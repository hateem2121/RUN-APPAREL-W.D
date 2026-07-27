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
npx -y codebase-memory-mcp@0.9.0 cli index_repository \
  --repo-path "$(pwd)" --mode full
```

This repository indexes in well under a second (~1.5k nodes / ~2.3k edges). The
project name derives from the path — `home-user-run-apparel-viewer` in a session
container, something else on a laptop. Run `cli list_projects` to see the name on
your machine; every query tool needs it as `--project`.

Re-run after large refactors. `cli detect_changes` reports drift, and a stale
index is the main failure mode worth knowing about: it answers confidently from
the old structure. When in doubt, re-index — it costs a second.

### Useful calls

| Tool | What it answers |
|---|---|
| `search_graph --project P --query "..."` | Ranked symbols matching a concept |
| `search_code --project P --pattern "..."` | Literal pattern, with file + line hits |
| `get_architecture --project P` | High-level module/dependency overview |
| `trace_path --project P` | Call path between two symbols |
| `detect_changes --project P` | What drifted since the last index |
| `index_status --project P` | Freshness and node/edge counts |

Note the arguments are `repo_path` / `pattern` / `project` — passing `path` or
omitting `project` fails with a validation error, not a useful message.

### Scope note

This is a **small** repository (~9.5k lines across 93 TypeScript files), and an
agent can read it directly without help. The graph earns its keep mainly on
impact analysis ("what touches `buildVariantId`?") rather than on context saving.
Keep an eye on whether it actually gets used. To remove it: delete `.mcp.json`,
then `npm uninstall -g codebase-memory-mcp` and `rm -rf ~/.cache/codebase-memory-mcp`
to reclaim the ~270 MB binary and the index. Nothing else in the repo depends on it.

### Verified behaviour

Checked against this repo on 2026-07-27, so the claims here are measured rather
than quoted from upstream:

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
  registration, and the 8 above is still what `.mcp.json` yields
- Full index of this repo: **~0.7s**, 1,536 nodes / 2,306 edges
- Warm query: **~0.07s**

### Optional hardening

`CBM_ALLOWED_ROOT=<absolute path>` restricts what the indexer is allowed to read.
It is not set in `.mcp.json` because the value is machine-specific, but it is
worth adding to your local agent config if you want the indexer confined to this
project.

### Upgrading

The version is pinned in `.mcp.json` so every machine runs the same build. Bump
that string deliberately, not automatically — Dependabot does not watch it.

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
