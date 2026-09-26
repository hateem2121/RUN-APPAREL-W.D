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
  in `.github/workflows/ci.yml` is pinned by TAG rather than digest, with a test
  enforcing the tag instead.
- **🟢 A CLO 7.0 export arrives as one GLB PER COLOURWAY** (`_0.._N`); `pipeline merge`
  joins them, and **`apps/shrink` never calls it**. See `tools/asset-pipeline/CLAUDE.md`.
