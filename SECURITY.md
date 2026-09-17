# Security policy

## Reporting a vulnerability

**Email `partner@wear-run.com` with `SECURITY` in the subject line.**

Please do **not** open a GitHub issue for a security problem. Issues in this
repository are used by the automated monitors (`uptime.yml`, `heartbeat.yml`,
`diagnostics-digest.yml`) and are visible to everyone with repository access.

Include whatever you have: the URL or endpoint, what you did, what happened, and
anything that would let us reproduce it. A screenshot or a `curl` line is
plenty — a formal write-up is not required.

**What to expect**

| Stage | Target |
|---|---|
| We acknowledge your report | within 3 working days |
| We tell you our assessment and rough timeline | within 10 working days |
| Fix for a critical issue reaches production | within 7 days of assessment |
| Fix for a lower-severity issue | next scheduled release |

This is a single-maintainer project on a $5/month infrastructure budget. Those
targets are honest intentions, not a contractual SLA.

## Scope

**In scope**

- `viewer.wear-run.help` — the public 3D viewer
- `cms.wear-run.help` — the Payload admin and the public read-only API
- `media.wear-run.help` — the R2 media domain
- Anything in this repository: the Workers, the shrink container, the asset
  pipeline, and the CI/CD workflows

**Out of scope**

- `https://wear-run.help/catalogue` and `/profile` answering **410**, and
  `https://catalogue.wear-run.help/`, `https://profile.wear-run.help/` or the same two
  addresses on `wear-run.com` answering **404** without a valid link. This is [by design](CLAUDE.md): decided 2026-09-11 and live from
  the merge that deploys it, the catalogue and company profile open only from a private
  link whose code is a Worker secret (`infra/apex-404/`). The apex itself is the
  marketing site, and every QR deep link uses the `viewer.` subdomain. None of these is
  an outage or a vulnerability, and neither is guessing a link's words: they keep out
  accidental visitors and search engines by design. Any way to reach a document's pages,
  pictures or PDF **without** its words is in scope.

  ⚠️ This said **522** until 2026-08-31, and "404 for everything but two PDF paths" until
  this change (decided 2026-09-11, live from the merge that deploys it). A 522 is a
  connection failure, not a design; reporting a timeout as intended behaviour would have
  taught a researcher to ignore a real outage.
- Missing security headers on Cloudflare's own challenge pages and error pages,
  which we do not generate.
- Reports produced solely by an automated scanner with no demonstrated impact.
- Denial of service, volumetric testing, or anything that would degrade the
  service for real buyers. **Please do not load-test the public endpoints.**
- Social engineering of RUN APPAREL staff or partners.

## Safe harbour

If you make a good-faith effort to follow this policy — you stay in scope, you
avoid privacy violations and service degradation, and you give us reasonable
time to respond before disclosing — we will not pursue action against you for
your research, and we will credit you if you want to be credited.

## What is already in place

Reported here so you do not spend time re-discovering it:

- **Secret scanning gates every deploy.** `gitleaks` runs in `ci.yml` inside the
  same workflow as the `deploy` job, because `needs:` cannot reference a job in
  another workflow — a separate `security.yml` could only ever fail its own run.
- **Dependency advisories gate every deploy.** `audit-ci` fails CI on any HIGH or
  CRITICAL advisory; the allowlist in `audit-ci.jsonc` carries a written
  justification per entry.
- **A 24-hour dependency cooldown.** `minimumReleaseAge: 1440` in
  `pnpm-workspace.yaml` refuses to resolve any release younger than a day, so a
  compromised package cannot be adopted the moment it is published.
- **Every GitHub Action is pinned to a full commit SHA**, and every workflow
  declares least-privilege `permissions:`. `apps/cms/src/workflowHardening.test.ts`
  fails the build if either regresses.
- **Content-Security-Policy** is generated from the built output by
  `apps/viewer/scripts/csp.mjs`, hashed per inline script, and applied to both
  asset-served and Worker-built responses (`worker/securityHeaders.ts`).
  `apps/viewer/scripts/csp.test.ts` pins the two copies together.
- **No source maps are deployed.** `ci.yml` asserts `apps/viewer/dist` contains
  zero `.map` files and refuses to deploy otherwise.
- **Admin login locks after 5 failed attempts**, and the public feedback endpoint
  is rate-limited.
- **The shrink container runs as a non-root user** and writes only to a
  per-job temporary directory.

## Handling of personal data

The 3D viewer collects no personal data and sets no tracking cookies. Buyer
enquiries are handed off to the visitor's own email or WhatsApp client — the
viewer never receives the message. The CMS stores staff accounts (email +
password hash) and product content only.

The private catalogue and company profile links are different: opening one records
the day and time, an approximate location, its time zone and the network, the
visitor's device, system, browser and language, the site they came from, how far they
read, the time between their first and last activity that day, and whether they
downloaded the file — in the website's own database, admins only. No IP address and
no cookie are stored. Counting different people uses a code built from the
connection and a secret that is replaced and deleted every day, so it cannot be
traced back to a visitor or linked across days. Records are kept 12 months, then
deleted automatically. See [wear-run.help/privacy](https://wear-run.help/privacy).

A D1 database export contains password hashes and is therefore never committed;
`backups/` is gitignored. See [docs/BACKUP-RESTORE.md](docs/BACKUP-RESTORE.md).
