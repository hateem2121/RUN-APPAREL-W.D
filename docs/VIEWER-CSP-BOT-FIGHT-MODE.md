# The CSP violation on every page load — full record

**In plain words:** The full story of a browser security warning on every page, and its fix.

Moved out of `apps/viewer/CLAUDE.md` on 2026-08-29 for room under the 39,000-character
gate. **RESOLVED 2026-08-06.** The live rule stayed in that file's Traps section; what is
here is the diagnosis, the API fix, and the two alternatives that were rejected.

Read this before touching CSP, Bot Fight Mode, or the zone's bot settings.

---

- **The CSP violation on every page load is Bot Fight Mode, NOT Web Analytics.**
  On 2026-08-05 it was diagnosed as Web Analytics' "Automatic Setup" injecting a
  beacon bootstrap, and that is **wrong** — corrected 2026-08-06 by reading the
  injected script instead of inferring it. It is Cloudflare's **JavaScript
  Detections** (`window.__CF$cv$params`, loading
  `/cdn-cgi/challenge-platform/scripts/jsd/main.js`), which is bundled with Bot
  Fight Mode and, per Cloudflare's docs, *"automatically enabled and cannot be
  disabled"* for Bot Fight Mode customers. Web Analytics was never involved: the
  delivered HTML had **zero** matches for `cloudflareinsights`, and a live load made
  **zero** requests to it.
  **No hash can ever cover it.** The script embeds a per-request ray id and
  timestamp, so its sha256 differs on every single load — measured three values in
  under a minute (`YQqe7Ux…`, `jgl9AA6h…`, `eXCOhXoR…`). Anyone "fixing" this by
  pinning a hash is chasing a value that changed before they pasted it.
  **RESOLVED 2026-08-06 — and the fix is not in the dashboard.** Turning Bot Fight
  Mode off is NOT sufficient: `enable_js` is a **separate zone flag that does not
  clear with it**, and the Free plan renders it as read-only status text
  ("JS Detections: On", tooltip "enabled by default when you turn on Bot fight
  mode") with no control. Verified via the API — `fight_mode: false` and
  `enable_js: true` at the same time.
  Fix, from an authenticated dashboard session:
  ```js
  // GET first; PUT REPLACES the config, so echo every field back.
  // PATCH returns 405 — this endpoint is PUT-only.
  const cur = (await (await fetch(`/api/v4/zones/${ZONE}/bot_management`,
    {credentials:'include'})).json()).result
  const body = {...cur, enable_js: false}; delete body.using_latest_model
  await fetch(`/api/v4/zones/${ZONE}/bot_management`,
    {method:'PUT', credentials:'include',
     headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
  ```
  Zone `wear-run.help` = `805d8ae5fa0dea40c960a2561f66d141`. Injection stopped
  immediately; the page now serves ONE inline script (our theme bootstrap) and logs
  no CSP error.
  Two rejected alternatives, for the record:
  - **`Cache-Control: no-transform` on the HTML** — documented to stop the
    injection, but it cannot be delivered to the SPA routes from `_headers` on this
    deployment. Tried and measured; see the `_headers` trap below.
  - **CSP nonces** — Cloudflare adds matching nonces to what it injects, by parsing
    your CSP response header. Not usable from a static `_headers` file: a nonce must
    be per-request, so it would need the viewer Worker to rewrite the header per
    response. Nonces set via `<meta>` are explicitly unsupported.
  Never widen to `'unsafe-inline'`.
