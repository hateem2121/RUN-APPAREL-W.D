# RUN APPAREL GLB shrink container.
#
# Built from the monorepo ROOT (see "image_build_context": "../../" in
# ../wrangler.jsonc) so it can bring in tools/asset-pipeline and reuse the exact
# pipeline source the CLI uses. The monorepo layout is preserved under /app so
# container/server.ts's relative import (../../../tools/asset-pipeline/src)
# resolves the same in the image as it does locally.
#
# Must run on linux/amd64. Build in CI (amd64 runners) or, on an arm64 Mac, with
# `--platform linux/amd64`.
#
# PINNED BY DIGEST for the same reason `npm ci` replaced `npm install` below: two
# builds of the same commit must produce the same pipeline. `node:24-slim` is a
# moving tag — it picks up Node patch releases and rebuilt system libraries, and
# sharp links against those. A change in the WebP encoder shows up as printed
# artwork looking different for no reason anyone can trace to a commit, which is
# the single hardest class of bug in this repository to attribute.
# WARNING: NOTHING AUTOMATED REFRESHES THIS DIGEST. This comment claimed Dependabot's
# `docker` ecosystem did until 2026-08-25, and that was never true:
# .github/dependabot.yml declares only `npm` and `github-actions`, and both sit at
# `open-pull-requests-limit: 0` by a deliberate quiet-mode decision. Bump it by
# hand. Do not unpin it to make an update easier, and do not "fix" this by adding
# a `docker` ecosystem — it would either sit at 0 and change nothing, or break
# the quiet mode on purpose. See the same correction in the root CLAUDE.md.
#
# PINNED-ON: 2026-08-29
# ⚠️ That line is READ BY A TEST (apps/cms/src/baseImageAge.test.ts), which fails once
# the pin is older than the refresh window. Base images are rebuilt mainly to pick up
# operating-system security fixes, so pinning is correct and never refreshing is not —
# and until 2026-08-29 nothing anywhere measured the age. Update the date in the SAME
# commit as the digest, or the gate is measuring a lie.
FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e

WORKDIR /app

# --- Asset pipeline (reused as-is) -------------------------------------------
# Install its runtime deps into tools/asset-pipeline/node_modules so the pipeline
# source resolves @gltf-transform / meshoptimizer / sharp / ktx2-encoder when it
# is imported by the container server. package.json first for layer caching.
# `npm ci` against a committed lockfile, NOT `npm install`.
#
# This was `npm install` with no lockfile at all, so every image build resolved
# the dependency tree afresh from the registry. Two builds of the same commit
# could ship different versions of meshoptimizer or sharp — and a change in the
# simplifier or the WebP encoder shows up as printed artwork looking different
# for no reason anyone can trace to a commit. `pnpm-workspace.yaml`'s
# `minimumReleaseAge` cooldown is a pnpm setting and never applied here.
#
# The lockfile is generated in isolation (not from the pnpm workspace, whose
# node_modules makes npm write symlink paths that do not exist in this image):
#   cd $(mktemp -d) && cp <repo>/tools/asset-pipeline/package.json . \
#     && npm install --package-lock-only
COPY tools/asset-pipeline/package.json tools/asset-pipeline/package-lock.json tools/asset-pipeline/
RUN cd tools/asset-pipeline && npm ci --omit=dev --no-audit --no-fund
COPY tools/asset-pipeline tools/asset-pipeline

# --- Container service --------------------------------------------------------
# Installs its own deps (aws4fetch) plus tsx, used to run the TypeScript server
# and pipeline source directly.
#
# ⚠️ THIS WAS `npm install` WITH NO LOCKFILE UNTIL 2026-08-29 — six lines below the
# comment above explaining, at length, why that was dangerous and had to be replaced.
# The reasoning was acted on for the first install and not the second. Two builds of
# the same commit could ship different versions of `tsx`, which is what actually RUNS
# the pipeline.
#
# The lockfile was already committed, already in sync and being maintained; nothing
# read it, because the Dockerfile never copied it in. A maintained file that nothing
# consumes is worse than no file: it makes the situation look handled.
#
# ⚠️ NO `--omit=dev` HERE, unlike the install above, and this is not an oversight.
# `tsx` and `typescript` are devDependencies AND the runtime — `server.ts` is executed
# as TypeScript. Adding `--omit=dev` to "match" the line above produces an image that
# builds cleanly and cannot start.
COPY apps/shrink/container/package.json apps/shrink/container/package-lock.json apps/shrink/container/
RUN cd apps/shrink/container && npm ci --no-audit --no-fund
COPY apps/shrink/container apps/shrink/container

WORKDIR /app/apps/shrink/container
EXPOSE 8080

# --- Drop root ----------------------------------------------------------------
# This service accepts a job over HTTP, pulls an arbitrary customer-supplied GLB
# from R2, and hands it to sharp, draco3dgltf, meshoptimizer and ktx2-encoder —
# four native decoders parsing untrusted binary input. That is the whole reason
# not to run it as uid 0: a memory-safety bug in any of them should not start
# from root.
#
# Safe without chowning anything, and both halves of that were checked rather
# than assumed:
#   * the pipeline writes ONLY to a per-job `mkdtemp(join(tmpdir(), 'shrink-'))`
#     (container/server.ts:60) — /tmp is 1777, so uid 1000 can write it;
#   * everything under /app is root-owned but world-readable (COPY's default
#     0644/0755), which is all `tsx server.ts` needs to read and execute it.
#
# The installs above deliberately stay as root. `chown -R node:node /app` would
# duplicate the entire node_modules layer — sharp, draco and ktx2-encoder are
# most of the image — to grant write access that nothing at runtime uses.
#
# `node` (uid 1000) ships with the official image; it is not created here.
ENV NPM_CONFIG_CACHE=/tmp/.npm \
    XDG_CACHE_HOME=/tmp/.cache
USER node

CMD ["npm", "run", "start"]
