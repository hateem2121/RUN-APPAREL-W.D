---
name: check-live
description: Check whether the live viewer is actually serving each garment right now — the API payload, the model file and the poster, fetched the way a browser fetches them. Use when asked "is the site up/working/broken", after a deploy, or before pointing a product at a new model.
allowed-tools: Bash(node .claude/skills/check-live/check-live.mjs:*)
---

# Is the site actually working?

```bash
node .claude/skills/check-live/check-live.mjs
```

Read-only. Add `--full` to download each model completely (**1.9-8.2 MB each**,
measured 2026-09-05) instead of the 1 KB range request; you almost never need it.

## What it checks, and why each of the easy answers is wrong

| Signal | Why it alone is not enough |
| :-- | :-- |
| `viewer.wear-run.help/<slug>` returns 200 | The viewer is an **SPA**: every path returns 200 HTML and renders "REFERENCE UNAVAILABLE" on the client. `uptime.yml` stayed green through six runs while the product 404ed. |
| `HEAD` on the model returns 200 | HEAD does **not** share the GET's cache entry. A model has returned `GET 404` (a cached error page, 25 h old) while HEAD returned 200 with the right content-length. |
| A full `GET` on the model | Correct, but 53.69 MB per check for the eleven products live on 2026-09-05, and more with every product added. |
| `content-length` on a `fetch` | **Reads 0 on this domain.** Node's undici sends `accept-encoding`, so Cloudflare compresses the GLB and drops the header; `curl -I`, which sends none, reports `content-length: 28271780` for the same URL in the same minute. That blinded `MIN_MODEL_BYTES` in the post-deploy gate for its entire life, and then blinded a hand-written sweep hours after the gate was fixed (2026-09-04). A range request is exempt from compression — read the size with `scripts/model-size.mjs`. |

So it uses a **ranged GET** — measured 2026-08-26: `HEAD` reported
`cf-cache-status: DYNAMIC`, the same URL's `bytes=0-1023` GET reported `HIT`, and
`content-range` still carried the full object size. A range request is a GET, so a
cached 404 shows up as a 404, for 1 KB.

## Reading the result

- **`FAIL model HTTP 404`** — not a cached miss any more: since 2026-09-03 every error
  from the media host is `no-store` (a missing `.glb` answered `BYPASS` on 2026-09-24).
  The object is missing or its key differs; confirm with
  `npx --yes wrangler@4.137.0 r2 object get "run-apparel-viewer-media/<key>" --remote --file /tmp/r2-check`
  (without `--remote` wrangler reads LOCAL storage and reports a real object as missing).
  Never a redeploy.
- **`FAIL API ... HTTP 404`** — the slug is not served. Slugs are printed on physical
  QR tags, so the slug is not the thing to change; find what renamed.
- **`note "<colourway>" is not a colourway`** — not an outage. The API fell back on
  purpose, but a silent fallback is how a stranded colourway tab goes unnoticed.
