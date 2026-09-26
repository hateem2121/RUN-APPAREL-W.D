---
paths:
  - "infra/**"
  - "apps/cms/worker.mjs"
  - "apps/cms/wrangler.jsonc"
---

# The apex site, and the private PDF links

Moved from the root `CLAUDE.md` on 2026-09-26, word for word. The root keeps the two
lines that must never be missed: never commit, log or print a PDF link code, and never
list or delete the email-signature project's records.

🟡 **The apex serves the SITE; the PDFs are PRIVATE LINKS (decided 2026-09-11, live since
2026-09-16).** `wear-run.help/*`
and `www.` go to the CMS Worker. `infra/apex-404/` serves `catalogue.` and `profile.` on
BOTH `wear-run.help` and `wear-run.com` (`/<code>`; pictures + the PDF, from the **shared**
`run-assets` bucket) and 410s the old `/catalogue` and `/profile`. The rest of
`wear-run.com`, `mta-sts.wear-run.help` and the `/map` + `/meeting` redirects belong to the
email-signature project: never list or delete one (`docs/CLOUDFLARE-SETUP.md` 11.8). **Each code is a Worker secret:
never commit, log or print one** — ci.yml refuses to deploy without both. Workers
Caching keys on path, NOT host, so all cacheable output sits under the code. **Do not
delete the apex DNS record** (zone routes need it proxied). CI deploys this Worker FIRST;
it once DRIFTED after a dashboard edit. Since 2026-09-16 it also writes a visit row
into the CMS database after each response, in
`ctx.waitUntil`. The page's own `cache-control` is `no-store` so every open reaches the
Worker, while pictures stay cached, so a cache HIT still never runs it. How-tos:
`docs/RUNBOOK.md`.
