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
FROM node:24-slim

WORKDIR /app

# --- Asset pipeline (reused as-is) -------------------------------------------
# Install its runtime deps into tools/asset-pipeline/node_modules so the pipeline
# source resolves @gltf-transform / meshoptimizer / sharp / ktx2-encoder when it
# is imported by the container server. package.json first for layer caching.
COPY tools/asset-pipeline/package.json tools/asset-pipeline/
RUN cd tools/asset-pipeline && npm install --omit=dev --no-audit --no-fund
COPY tools/asset-pipeline tools/asset-pipeline

# --- Container service --------------------------------------------------------
# Installs its own deps (aws4fetch) plus tsx, used to run the TypeScript server
# and pipeline source directly.
COPY apps/shrink/container/package.json apps/shrink/container/
RUN cd apps/shrink/container && npm install --no-audit --no-fund
COPY apps/shrink/container apps/shrink/container

WORKDIR /app/apps/shrink/container
EXPOSE 8080
CMD ["npm", "run", "start"]
