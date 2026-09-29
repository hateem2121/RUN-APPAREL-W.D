---
paths:
  - "apps/shrink/**"
  - "tools/asset-pipeline/package.json"
  - "tools/asset-pipeline/package-lock.json"
---

# The shrink Worker and its Container

Moved from the root `CLAUDE.md` on 2026-09-26, word for word except where marked. The
`@cloudflare/workers-types` hold that applies to `apps/shrink` only is in
`.claude/rules/dependencies.md`, which loads for any `package.json`.

- **`apps/shrink/container` is not a workspace member.** It installs with plain
  `npm` inside Docker, so it cannot use `workspace:*` deps, and `pnpm -r` skips
  it. It has its own CI typecheck step; keep it.
  🟢 **The typecheck step was never the gap — `npm ci` is.** `tools/asset-pipeline`
  carries a SECOND lockfile (`package-lock.json`, npm's, read only by
  `apps/shrink/Dockerfile`) that no workspace tooling maintains, so bumping that
  `package.json` in the workspace desynchronises it and the image build dies on
  `npm ci` **after** every local gate has passed. Cost a deploy on 2026-08-12; full
  procedure in `tools/asset-pipeline/CLAUDE.md`.
- **🟡 The shrink container runs as uid 1000, not root, since 2026-08-13 — it can
  write ONLY under `/tmp`.** `/app` is root-owned and read-only to it, so any new
  scratch path must go through `mkdtemp(join(tmpdir(), …))` as `container/server.ts`
  already does. A write to `/app` will pass every local gate and fail at runtime
  inside the Container, where the error surfaces as a failed shrink job rather
  than as a permissions problem. Verified by running the image: writes `/tmp`,
  refused `/app`, service starts and answers. The base image is **digest-pinned**
  for build reproducibility (sharp links against system libs).
  🟡 **NOTHING AUTOMATED REFRESHES THAT PIN.**
  `.github/dependabot.yml` declares no `docker` ecosystem at all. Of the two it does
  declare, npm sits at `open-pull-requests-limit: 0` by deliberate quiet-mode decision,
  so only security advisories open a PR, and github-actions at
  `open-pull-requests-limit: 1` since 2026-09-10 (owner decision). *(Corrected
  2026-09-26: this used to say both sat at 0.)* Bump the digest by hand.
  Do not unpin it to make an update easier, and do not "fix" this by adding a third
  ecosystem — it would either sit at 0 and change nothing,
  or break the quiet mode on purpose. The same absence is why the Playwright container
  in `.github/workflows/ci.yml` was pinned by TAG alone until 2026-09-29; since then it
  is tag AND digest (owner decision — a tag can be republished, a digest cannot), both
  bumped by hand in the same change, and `workflowHardening.test.ts` refuses an image
  without the digest.
- **🟢 A CLO 7.0 export arrives as one GLB PER COLOURWAY** (`_0.._N`); `pipeline merge`
  joins them, and **`apps/shrink` never calls it**. See `tools/asset-pipeline/CLAUDE.md`.

## `tools/asset-pipeline/` has TWO lockfiles, and only one of them pnpm maintains

**If you change `tools/asset-pipeline/package.json`, you must regenerate
`package-lock.json` by hand, or the container deploy fails on `main`.**

`pnpm-lock.yaml` is the workspace's. `package-lock.json` here is **npm's**, is
consumed only by `apps/shrink/Dockerfile`, and **no workspace tooling ever touches
it** — so a dependency bump made in the workspace desynchronises it silently.

Measured 2026-08-12 on the dependency refresh merged as `9c22a2a`: five packages
drifted (`@playwright/test` 1.62.0→1.62.1, `@types/node` 26.1.1→26.2.0, `tsx`
4.23.1→4.23.12, `playwright` and `playwright-core` 1.62.0→1.62.1) and the Docker
build died on `npm ci` with *"can only install packages when your package.json
and package-lock.json are in sync"*.

🟢 **Note where it did not surface — this was the whole trap.** `lint`, `typecheck`
5/5, 621 tests, `build`, and the container's own `tsc --noEmit` were *all green*,
because **none of them run `npm ci`**. `.claude/rules/shrink-container.md` already says
`apps/shrink/container` "is not a workspace member… it has its own CI typecheck
step"; the typecheck step was never the gap. `npm ci` is, and it lives one
directory away, here.

✅ **CAUGHT LOCALLY.** `scripts/check-lockfile-sync.mjs`
reproduces `npm ci`'s own sync rule with no npm, no network and no install, and
runs inside `pnpm test` via `apps/cms/src/lockfileSync.test.ts`. It also fails on
the `"resolved": "file:"` paths that appear when the lockfile is regenerated
inside the pnpm workspace — the other half of the procedure below. **Still
regenerate by hand when you change `package.json`;** the check only makes
forgetting cost seconds instead of a deploy.

Regenerate 🟡 **in a temp dir, never in the workspace** — pnpm's symlinked
`node_modules` makes npm write `file:` paths that do not exist inside the image
(the reason is also stated in the Dockerfile above the failing line):

```bash
cd $(mktemp -d) && cp ~/Sites/Model-Viewer-main/tools/asset-pipeline/package.json . \
  && npm install --package-lock-only
```

Then copy `package-lock.json` back and check three things before committing:
every version matches `package.json`, `npm ci --omit=dev --no-audit --no-fund`
exits 0, and `grep -c '"resolved": "file:' package-lock.json` returns 0.

*(Moved from `tools/asset-pipeline/CLAUDE.md` on 2026-09-26, word for word.)*
