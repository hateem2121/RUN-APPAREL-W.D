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
# builds of the same commit must produce the same pipeline. `node:26-trixie-slim` is a
# moving tag — it picks up Node patch releases and rebuilt system libraries, and
# sharp links against those. A change in the WebP encoder shows up as printed
# artwork looking different for no reason anyone can trace to a commit, which is
# the single hardest class of bug in this repository to attribute.
# DEPENDABOT PROPOSES DIGEST BUMPS SINCE 2026-10-03 (owner decision): the `docker` block in
# .github/dependabot.yml opens one at a time, within the current Node major, after a 7-day cooldown. Until
# then nothing automated refreshed this digest, and until 2026-08-25 this comment wrongly
# said Dependabot did. A bump changes the system libraries sharp links against, so look at
# a rendered garment print before merging one. Do not unpin it to make an update easier.
#
# Last print check, 2026-10-14 (0e0ff40 -> d6aa754): the 15 textures of the live rxps model,
# re-encoded with texture-artwork.ts's artwork WebP settings in both images, decoded to
# byte-identical pixels (sharp 0.35.5 ships its own libvips 8.18.7 / libwebp 1.6.0, the same
# in both); quality 94 as the control changed all 15. The wordmark fixture alone was blind
# to it: its colour is flat and its alpha lossless.
#
# DEBIAN 13 SINCE 2026-10-20 (owner decision): node:24-slim is Debian 12, whose perl-base
# 5.36.0-7+deb12u3 carried three fixable CRITICALs (CVE-2026-13221, CVE-2026-42496,
# CVE-2026-8376) that the newest node:24-slim (a5f4366e…, pushed 2026-10-14) still had, so
# shrink-image-audit passed only on dated waivers renewed by hand each week. This image scanned
# clean at the gate's flags with no waiver (Trivy 0.70.0, --pkg-types os --severity CRITICAL
# --ignore-unfixed: exit 0; d6aa754 and a5f4366e: exit 1). It moves Node 24.21.0 -> 24.22.0 and
# glibc 2.36 -> 2.41; sharp 0.35.5 and its own libvips 8.18.7 / libwebp 1.6.0 are the same.
# Print check, both images built for linux/amd64 from this Dockerfile and run through
# shrinkFile() with the robot's flags on two raw CLO exports: the canonical rxps export
# (382,107,380 B, balanced) and APEX FLEX PULLOVER (fidelity) came out BYTE-IDENTICAL, and the
# rxps wordmark and two label crops (raw/CANONICAL.json views) rendered 0.00% changed. Control:
# `--no-uv-remap` on the pullover changed the output (1,886,524 -> 2,245,916 B), so the
# comparison can see a difference; --quality, --max-texture and --simplify-error did not,
# because refineFlags rewrites them for a small, texture-heavy export.
#
# NODE 26 SINCE 2026-10-24 (owner decision, made knowing Node 26 becomes Active LTS on
# 2026-10-28 and that Node's releases page says production should use an LTS line). Node
# 24.22.0 -> 26.12.1 on the same Debian 13 base. Print check the same way as 2026-10-20: both
# images built for linux/amd64 from this Dockerfile (git archive of HEAD), shrinkFile() run
# with shrinkFlagsFor() on the canonical rxps export (382,107,380 B, balanced) and APEX FLEX
# PULLOVER (fidelity). Outputs BYTE-IDENTICAL, SHA-256 equal: pullover 1,886,524 B
# (9b26c709…), rxps 16,683,676 B (8e0264c5…). Control: `--no-uv-remap` on the pullover gave
# 2,245,916 B (7ae698e9…), so the comparison sees a change — the same sizes 2026-10-20 measured.
#
# PINNED-ON: 2026-10-24
# ⚠️ That line is READ BY A TEST (apps/cms/src/baseImageAge.test.ts), which fails once
# the pin is older than the refresh window. Base images are rebuilt mainly to pick up
# operating-system security fixes, so pinning is correct and never refreshing is not —
# and until 2026-08-29 nothing anywhere measured the age. Update the date in the SAME
# pull request as the digest (Dependabot moves only the digest), or the gate is measuring
# a lie.
FROM node:26-trixie-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec

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
#
# WORKDIR, not `RUN cd …` (Trivy DS-0013, 2026-10-01). A COPY destination is relative to
# WORKDIR, so `./` lands in the same /app/tools/asset-pipeline the old paths named —
# compared on a before/after build of this image.
WORKDIR /app/tools/asset-pipeline
COPY tools/asset-pipeline/package.json tools/asset-pipeline/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY tools/asset-pipeline ./
# Header-only acceptance is shared with the CMS; no workspace runtime dependency.
COPY packages/shared/src/modelTextureSafety.ts packages/shared/src/media.ts /app/packages/shared/src/

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
WORKDIR /app/apps/shrink/container
COPY apps/shrink/container/package.json apps/shrink/container/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/shrink/container ./

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
