# DECISION — the 90-day backup artifact stays, and why an audit finding was refused

**In plain words:** Why we keep each database backup for 90 days.

> ⚠️ **SUPERSEDED IN PART, 2026-09-10 — the repository became public.** This file names
> exactly that event as the trigger to revisit, and the owner decided: the nightly
> artifact STAYS at 90 days, but it is now ENCRYPTED with `age` to a key only the owner
> holds, and so is the R2 mirror artifact (docs/BACKUP-RESTORE.md, "The backup key"). The
> pre-deploy snapshot is no longer an artifact at all; it goes to R2 `run-private`. A
> repository's own artifact-retention setting caps `retention-days` — measured on
> 2026-09-10, an artifact asking for 90 days was given the repository's 30 — so that
> setting was put back to 90 to match. Everything below is the reasoning as it stood while
> the repository was private.

**Decided 2026-08-30.** Short version:

> **We are NOT shortening `retention-days: 90` on the nightly D1 backup artifact,
> even though it contains password hashes. Shortening it trades a measured recovery
> capability for a marginal confidentiality gain in a private repo. If the hashes are
> the worry, encrypt the dump or exclude the `users` table — do not shorten recovery.**

This file exists because a **refused** finding needs a written reason just as much as
an implemented one. Otherwise the next audit re-raises it, and the next session either
re-argues it from scratch or — worse — quietly implements it, because "reduce
retention of a file containing password hashes" is an easy thing to agree with.

## The finding

the 2026-08-30 Cloudflare + GitHub audit (kept privately — it records live infrastructure identifiers and is not part of this public repository)
records it as CONFIRMED, and the fact is true:
[`.github/workflows/nightly-backup.yml`](../.github/workflows/nightly-backup.yml)
uploads `backups/d1/*.sql` as a GitHub Actions artifact with `retention-days: 90`, the
dump is unfiltered, and it therefore contains Payload's user password hashes.

## Why it is refused

**1. It reverses an owner decision made twelve days earlier, with arithmetic.**
Retention was cut **180 → 90** on 2026-08-18 as audit finding H1, and the reasoning is
written into the workflow beside the number: ninety days covers investigating a bug
reported weeks ago and comparing against last quarter. Cutting it again on a different
audit's say-so, without new evidence, is churn — and it discards the one thing that
makes the current value defensible, which is that somebody measured before choosing it.

**2. It is the only copy outside the blast radius.** The D1 database, the R2 mirror and
the Cloudflare API token that can delete both live in the *same Cloudflare account*.
The Actions artifact is the only copy that does not. Shortening the window shortens the
one recovery path that survives an account-level mistake — which is the scenario a
backup is for.

**3. The exposure it reduces is small, and the reduction is smaller.** The repository is
**private**. Reading the artifact requires repo access, which is the same access that
already grants the Cloudflare secrets, the ability to run any workflow, and the ability
to read the database directly. An attacker who can download the artifact does not need
the artifact. Going 90 → 30 days removes 60 days of a window that only opens to someone
who already holds strictly stronger access.

**4. Payload hashes are not plaintext.** They are scrypt-derived. The exposure is a
credential-cracking cost, not a credential.

## What we do instead

The finding points at something real — an unfiltered dump is more than the backup needs
to be. The right fix reduces the *content*, not the *window*:

- **Exclude the `users` table from the artifact**, or encrypt the dump before upload
  (age/gpg with a key held outside GitHub). Either keeps 90 days of recovery while
  removing the hashes from the artifact entirely.
- **Revisit if the repository ever becomes public**, or if the org grows past one
  filled seat. Both change premise 3 materially, and premise 3 is doing most of the
  work here.

Neither is urgent. Both are strictly better than shortening retention, and neither
costs the recovery window.

## What would change this decision

- The repository becomes public, or gains members who should not read password hashes.
- A backup copy appears **outside** the Cloudflare account by some other route, at
  which point the artifact stops being the only off-account copy and premise 2 weakens.
- Someone measures a real incident where a 90-day artifact was the exposure vector.

Until one of those happens, the number stays at 90 and this file is the reason.
