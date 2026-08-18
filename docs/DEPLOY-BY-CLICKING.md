# Deploying — the simple version

**You almost never need this file.** Once the one-time setup is done, deploying
is automatic: **push to `main` and GitHub Actions builds, tests, and deploys.**
Watch the **Actions** tab of the `RUN-APPAREL/run-apparel-viewer` repo.

This page covers the **one-time setup** that makes that automation work, plus a
dashboard-only fallback if you ever want to deploy without the command line.

> ⚠️ **Never** touch the existing `run-apparel` worker or `run-apparel-db` — that
> is a separate live site. Everything here uses the `...-viewer...` names.

---

## One-time setup (makes `git push` deploy for you)

Done once, together with Claude, in [CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md).
In short:

1. You create a scoped **Cloudflare API token** (dashboard, ~5 minutes).
2. Claude stores it as GitHub repo secrets `CLOUDFLARE_API_TOKEN` +
   `CLOUDFLARE_ACCOUNT_ID`, and sets the repo variable `DEPLOY_ENABLED=true`.
3. From then on, every push to `main` deploys automatically after tests pass.

> ⚠️ **The token must be a Custom one, and must include Containers + Cloudchamber.**
> Without those two, everything appears to work — the CMS and viewer deploy fine —
> but the shrink service's container image silently never updates, and the
> workflow fails with `ApiError: Forbidden` that names neither the permission nor
> the step. This cost three failed deploys and nearly shipped a stale pipeline. The
> exact nine-row permission table is in [RUNBOOK.md](RUNBOOK.md) → *How deploys work*.

---

## Fallback A — deploy from the command line

If CI is down or you want to deploy by hand (needs `wrangler login` or the API
token in your shell):

```bash
pnpm --filter @run-apparel/cms run deploy          # the CMS "brain"
# Build with the SAME API URL the automation uses (currently the workers.dev one):
VITE_API_BASE_URL="$(gh variable get VITE_API_BASE_URL)" pnpm --filter @run-apparel/viewer build
rm -f apps/viewer/dist/_redirects                  # Pages-only file, not valid on the Worker
pnpm --filter @run-apparel/viewer exec wrangler deploy   # → run-apparel-viewer-site Worker
```

---

## Fallback B — deploy from the Cloudflare dashboard (no command line)

Only if you cannot use CI **and** cannot use the command line.

**CMS worker**

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** →
   **Import a repository** → pick `RUN-APPAREL/run-apparel-viewer`.
2. Project/Worker name `run-apparel-viewer-cms`, production branch `main`,
   **Root directory** `apps/cms`, **Deploy command** `pnpm --filter @run-apparel/cms run deploy`.
3. Add the secret `PAYLOAD_SECRET` (the long code Claude generates). Save & Deploy.
4. Settings → Domains & Routes → add `cms.wear-run.help`.

**Viewer**

> Since 2026-07-22 the viewer is the **`run-apparel-viewer-site` Worker**
> (Static Assets) — the old Pages project was deleted. A dashboard-only viewer
> deploy isn't practical for the Worker; use CI (normal path) or Fallback A.
> The `viewer.wear-run.help` domain lives on that Worker under
> *Settings → Domains & Routes*.

---

## First login + content

1. `https://cms.wear-run.help/admin` → the first-user screen → create **your own**
   Admin account (your email + your password — Claude never sets this).
2. Add products through the admin panel, or ask Claude to load the demo product.

If anything looks different or a build fails, copy the error text to Claude.
