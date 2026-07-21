# Deploy by clicking — no command line needed

This gets the site live using only the Cloudflare dashboard (clicking), by
connecting the GitHub repo. Cloudflare's own build servers do the work.

You will deploy two things:

1. **The CMS (the "brain")** — a Cloudflare Worker named `run-apparel-viewer-cms`.
2. **The viewer (the public page)** — a Cloudflare Pages site.

The database (`run-apparel-viewer-db`) and file storage (`run-apparel-viewer-media`)
already exist and are already wired up in the code — you don't create those.

> ⚠️ **Never** touch the existing `run-apparel` worker or `run-apparel-db` — that's a
> separate live site. Everything here uses the `...-viewer...` names.

---

## Stage 1 — Deploy the CMS (the brain)

1. Go to **https://dash.cloudflare.com** → left sidebar **Workers & Pages**.
2. Click **Create** → tab **Import a repository** → connect GitHub if asked →
   pick **`hateem2121/Model-Viewer`**.
3. Fill in:
   - **Project/Worker name:** `run-apparel-viewer-cms`
   - **Production branch:** `main`
   - Expand **Build settings / Advanced** and set:
     - **Root directory:** `apps/cms`
     - **Build command:** `pnpm install && npx opennextjs-cloudflare build`
     - **Deploy command:** `npx wrangler deploy`
4. Add one **Variable/Secret** (Settings → Variables, or during setup):
   - Name: `PAYLOAD_SECRET` — Value: *(the long code Claude gave you in chat)* — mark it **Secret/Encrypt**.
5. Click **Save and Deploy**. First build takes a few minutes.
6. When it finishes, open **Settings → Domains & Routes → Add → Custom domain** and
   add `cms.wear-run.help`.

Tell Claude "CMS deployed" — Claude will verify it from their side.

---

## Stage 2 — Deploy the viewer (the public page)

1. **Workers & Pages** → **Create** → tab **Pages** → **Connect to Git** →
   pick **`hateem2121/Model-Viewer`**.
2. Fill in:
   - **Project name:** `run-apparel-viewer`
   - **Production branch:** `main`
   - **Build command:** `pnpm install && pnpm --filter @run-apparel/viewer build`
   - **Build output directory:** `apps/viewer/dist`
3. Add a **Variable**:
   - `VITE_API_BASE_URL` = `https://cms.wear-run.help`
4. Click **Save and Deploy**.
5. When done: **Custom domains → Set up a domain →** `viewer.wear-run.help`.

Tell Claude "viewer deployed".

---

## Stage 3 — First login + content

1. Open `https://cms.wear-run.help/admin` → create your **Admin** account
   (this is the first-user screen; pick your own email + password).
2. Add products through the friendly admin panel, **or** ask Claude to load the
   demo product N001 for you.

---

## Stage 4 (optional) — Visit counter

- Dashboard → **Analytics & Logs → Web Analytics → Add a site** → `viewer.wear-run.help`
  → copy the **beacon token** → in the Pages project add variable
  `VITE_CF_BEACON_TOKEN` = *(that token)* → redeploy.

---

### If any screen looks different or a build fails

Copy the error text to Claude. Cloudflare occasionally renames buttons; the names
above are the current ones. If clicking gets fiddly, the alternative is to allow
full internet on this project's environment and let Claude run the whole deploy in
a fresh session.
