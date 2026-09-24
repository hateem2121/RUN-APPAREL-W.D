---
paths:
  - "apps/viewer/worker/**"
  - "apps/viewer/scripts/**"
  - "apps/viewer/public/**"
---

# Viewer headers, CSP and the edge

**Read the headers, CSP and edge traps in `apps/viewer/CLAUDE.md` before changing
anything here.** They are six bullets there, beginning:

1. "The inline-script CSP violation is Cloudflare PRECURSOR"
2. "`_headers` rules that both match are COMBINED"
3. "Per-garment link previews are CRAWLER-ONLY"
4. "`_headers` is applied by the STATIC ASSET HANDLER"
5. "`og:image` must not be the WebP poster"
6. "A build-time CSP cannot cover an edge-injected script"

The safe-area bullet between 1 and 2 is NOT one of them: it governs `apps/viewer/src/`,
where this rule never loads. The six have not moved into this file yet. To move them:
copy them here verbatim, leave a one-line hook behind, and update the trap count the
root `CLAUDE.md` states in the same commit (`apps/cms/src/claudeMd.test.ts` checks it).

## Why a rule and not a nested CLAUDE.md

The headers/CSP/edge traps do not cleave along directory lines. `_headers` is
*generated* — it exists only at `apps/viewer/dist/_headers`, written by
`apps/viewer/scripts/gen-headers.mjs` — while the half that answers for it lives in
`apps/viewer/worker/securityHeaders.ts`. A nested CLAUDE.md keys on ONE directory,
so whichever directory it sat in, it would stay silent while you edited the other
half. A `paths:` glob is the only mechanism here that covers both, and it fires for a
rule present at session start (measured 2026-09-05; the record is in
`docs/CLAUDE-MD-MAINTENANCE.md`).

Like a nested CLAUDE.md, a rule is **not re-injected after `/compact`**. It reloads
only when a matching file is next read.
