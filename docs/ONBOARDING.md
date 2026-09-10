# Onboarding — from a clean checkout to a running site

**Target: 30 minutes.** Every command below is the real one, copied from a run that
worked on 2026-08-13, not reconstructed from memory. If a step takes materially
longer than its stated time, that is a bug in this page — say so.

This page is deliberately short. It gets you *running*. The reasons things are built
the way they are live in [`CLAUDE.md`](../CLAUDE.md) and
[`docs/HARDENING-LOG.md`](HARDENING-LOG.md); read those once the code runs, not
before.

---

## Before you start — the two things that waste the most time here

**1. `pnpm` is probably not on your PATH. Every documented `pnpm <script>` in this
repository means `npx --yes pnpm@10.34.5 <script>`.**

Bare `pnpm` fails with exit **127**, and the failure surfaces somewhere unhelpful:
`apps/viewer/e2e/prepare.mjs` shells out to `pnpm build`, so the whole end-to-end
suite dies two minutes later as `Timed out waiting 120000ms from config.webServer`
with the real error buried in a child process.

```bash
npx --yes pnpm@10.34.5 --version   # expect 10.33.0
node --version                     # expect v24.x
```

**2. If anything fails in a way that makes no sense, check these two variables
FIRST — before reading any code.**

```bash
env | grep -E '^(NODE_ENV|PORT)='
```

A `NODE_ENV=development` inherited from another project broke the CMS build with a
React `useContext` error that named nothing relevant. A `PORT` set for another
project bound the e2e server to the wrong port and produced the same two-minute
timeout as above. Both are now fixed at the source, so day to day this does not
matter — but it has cost two sessions, and the check costs one second.

---

## 1. Install (≈2 min)

```bash
npx --yes pnpm@10.34.5 install --frozen-lockfile
```

`--frozen-lockfile` always. Run it again after every merge — the lockfile moves
often here.

## 2. Prove the checkout is healthy (≈4 min)

Run the gates in CI's order. If these pass, your machine is fine and anything that
breaks later is something you did.

```bash
npx --yes pnpm@10.34.5 lint
npx --yes pnpm@10.34.5 typecheck
npx --yes pnpm@10.34.5 test:coverage
```

Expect: lint clean across ~248 files, typecheck clean in 5 workspaces, 750+ tests
passing, and a coverage summary ending `Coverage gate passed.`

## 3. Build, and check the page weight (≈3 min)

```bash
npx --yes pnpm@10.34.5 seed:assets
npx --yes pnpm@10.34.5 build
node scripts/check-bundle-budget.mjs
```

`seed:assets` generates placeholder GLBs and merges them into one file with three
colourways — the same shape a real garment has. `check-bundle-budget.mjs` reads
`apps/viewer/dist`, so it exits 1 unless the build ran first.

## 4. Run the CMS (≈5 min)

```bash
echo "PAYLOAD_SECRET=$(openssl rand -hex 32)" > apps/cms/.env
npx --yes pnpm@10.34.5 --filter @run-apparel/cms migrate   # first run only
npx --yes pnpm@10.34.5 seed:cms
npx --yes pnpm@10.34.5 dev:cms
```

Admin at <http://localhost:3000>. `seed:cms` creates product **N001**, its
colourways, the site settings and a dev admin user.

> ⚠️ **Running the CMS dev server dirties your working tree.** `next dev` rewrites
> `apps/cms/src/app/(payload)/admin/importMap.js` and `apps/cms/next-env.d.ts` in
> their own formatting, and `pnpm lint` then fails on formatting alone. **Stop the
> dev server first**, then `git checkout --` both files. Restoring while it is still
> running just loses the race.

## 5. Run the viewer (≈2 min)

In a second terminal:

```bash
npx --yes pnpm@10.34.5 dev:viewer
```

Viewer at <http://localhost:5173>. Go to **<http://localhost:5173/n001/navy>** — that
URL shape is the whole product: it is what a printed QR code on a garment tag
resolves to.

## 6. Run the browser suite (≈5 min)

```bash
cd apps/viewer && npx --yes pnpm@10.34.5 test:e2e
```

Five browsers including WebKit. WebKit is not optional: a QR code is scanned with a
phone camera, which opens iOS Safari.

---

## What you have NOT run, and why it matters

Three gates CI runs are invisible from the workspace root, and "it passed locally"
has failed here twice because of exactly that.

```bash
bash scripts/test-alert-shell.sh                  # the alert branch nothing else exercises
npx --yes pnpm@10.34.5 eval:artwork               # artwork legibility — gates the deploy
cd apps/shrink/container && npm install --no-audit --no-fund && npx tsc --noEmit
```

- `apps/shrink/container` is **not a pnpm workspace member**, so `pnpm -r` skips it
  entirely — and it is the code that processes every real garment.
- `eval:artwork` runs in its own CI job. It renders the printed wordmark before and
  after the real decimation chain and fails if too much of it moved. It is the only
  gate that looks at what a buyer actually sees.
- `test-alert-shell.sh` exercises the alerting branch of the monitoring workflows —
  code that only ever runs when something is already broken, and which was silently
  disabled for 17 days once.

---

## The one thing to understand before you change anything

**A test fixture that cannot exhibit the failure is not a test.** Three production
bugs in three consecutive sessions were invisible for that single reason: the seeded
placeholders had no geometry compression, no textures and no UVs, so no production
model could render, every production garment tripped a CSP violation, and the entire
printed-artwork path was untested — with 177 tests green throughout.

Before adding a test, ask what would have to break for it to fail. If the answer is
"nothing that happens in production", it is not a test.

**If production compresses, seed compressed. If production prints, seed a print.**

---

## Where to go next

| You want to… | Read |
|---|---|
| Understand the traps that have cost sessions | [`CLAUDE.md`](../CLAUDE.md) |
| Put a real garment on the site | [`docs/FIRST-GARMENT-UPLOAD.md`](FIRST-GARMENT-UPLOAD.md) |
| Deploy, migrate, or fix something live | [`docs/RUNBOOK.md`](RUNBOOK.md) |
| Change the asset pipeline | [`tools/asset-pipeline/CLAUDE.md`](../tools/asset-pipeline/CLAUDE.md) |
| Change the viewer, its Worker or its headers | [`apps/viewer/CLAUDE.md`](../apps/viewer/CLAUDE.md) |
| Contribute a change — the full gate list | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
