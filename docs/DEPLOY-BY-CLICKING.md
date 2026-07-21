# Deploying — the simple version

**You almost never need this file.** Once the one-time setup is done, deploying
is automatic: **push to `main` and GitHub Actions builds, tests, and deploys.**
Watch the **Actions** tab of the `hateem2121/run-apparel-viewer` repo.

This page covers the **one-time setup** that makes that automation work, plus a
dashboard-only fallback if you ever want to deploy without the command line.

> ⚠️ **Never** touch the existing `run-apparel` worker or `run-apparel-db` — that
> is a separate live site. Everything here uses the `...-viewer...` names.

---

## One-time setup (makes `git push` deploy for you)

Done once, together with Claude, in [CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md).
In short:

1. You create a scoped **Cloudflare API token** (dashboard, ~3 minutes).
2. Claude stores it as GitHub repo secrets `CLOUDFLARE_API_TOKEN` +
   `CLOUDFLARE_ACCOUNT_ID`, and sets the repo variable `DEPLOY_ENABLED=true`.
3. From then on, every push to `main` deploys automatically after tests pass.

---

## Fallback A — deploy from the command line

If CI is down or you want to deploy by hand (needs `wrangler login` or the API
token in your shell):

```bash
pnpm --filter @run-apparel/cms deploy          # the CMS "brain"
VITE_API_BASE_URL=https://cms.wear-run.help pnpm --filter @run-apparel/viewer build
pnpm --filter @run-apparel/viewer exec wrangler pages deploy apps/viewer/dist \
  --project-name run-apparel-viewer --branch main
```

---

## Fallback B — deploy from the Cloudflare dashboard (no command line)

Only if you cannot use CI **and** cannot use the command line.

**CMS worker**

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** →
   **Import a repository** → pick `hateem2121/run-apparel-viewer`.
2. Project/Worker name `run-apparel-viewer-cms`, production branch `main`,
   **Root directory** `apps/cms`, **Deploy command** `pnpm --filter @run-apparel/cms deploy`.
3. Add the secret `PAYLOAD_SECRET` (the long code Claude generates). Save & Deploy.
4. Settings → Domains & Routes → add `cms.wear-run.help`.

**Viewer (Pages)**

1. **Create → Pages → Connect to Git** → `hateem2121/run-apparel-viewer`.
2. Project name `run-apparel-viewer`, production branch `main`,
   build command `pnpm install --frozen-lockfile && pnpm --filter @run-apparel/viewer build`,
   output directory `apps/viewer/dist`.
3. Variable `VITE_API_BASE_URL=https://cms.wear-run.help`. Save & Deploy.
4. Custom domains → `viewer.wear-run.help`.

---

## First login + content

1. `https://cms.wear-run.help/admin` → the first-user screen → create **your own**
   Admin account (your email + your password — Claude never sets this).
2. Add products through the admin panel, or ask Claude to load the demo product.

If anything looks different or a build fails, copy the error text to Claude.
