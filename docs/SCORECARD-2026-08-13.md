# Project scorecard — 2026-08-13

Plain-English health check on RUN APPAREL. Written for the owner, not for a
developer. Supersedes [`docs/SCORECARD-2026-08-08.md`](SCORECARD-2026-08-08.md),
which is kept because it shows what moved.

**The question this answers:** *can we add more garments and start sharing these
with our leads?*

---

## Overall: 96 / 100

Think of the project as a car. On 2026-08-08 the engine was excellent and the
problems were all in the last mile. Those are now done, and this session closed the
next layer down: **the checks that were watching the car now have checks watching
them.**

The single sentence version: **almost everything that could quietly go wrong here
now has something automatic that would notice.**

---

## The ten areas

| # | Area | Score | One line |
|---|---|---|---|
| 1 | Documentation & onboarding | 10 | A timed 30-minute setup path, and every file a document mentions is checked to exist |
| 2 | Code quality & types | 10 | Strictest settings on; the invisible rules about what may import what are now enforced |
| 3 | Automated testing | 10 | 846 checks, and for the first time somebody counts how much of the code they touch |
| 4 | CI/CD & deploy safety | 10 | The trap that cost a deploy is caught locally; every job has a time limit; the undo command is checked |
| 5 | Security & supply chain | 10 | A full parts list of all 1,067 ingredients, and a legal check on every licence |
| 6 | Performance | 9 | Live speed is measured weekly against real thresholds, not by hand once |
| 7 | Reliability & backups | 9 | The backup is now **restored** every night, not merely taken |
| 8 | Observability & incidents | 9 | Error tracking's privacy promises are now tested, not just written down |
| 9 | Freshness | 10 | Everything current for Aug 2026, and the two deliberate exceptions check themselves |
| 10 | AI-agent readiness | 10 | Already best-in-class; the guard files got stronger |

---

## What changed today, in plain words

### The tests now count themselves

Before: 629 automatic checks, and **nobody knew what fraction of the code they
touched.** A whole area could have been untested and everything still looked green.

Now: 846 checks, and the coverage is measured, printed, and **blocked from getting
worse**. The new checks went where a customer would actually feel a bug — who is
allowed to log in, the address a QR code resolves to, the contact buttons, the
"sorry, unavailable" page.

One detail worth knowing, because it is the reason this was worth doing properly:
when the check was tested by *removing* one part of the project from the
measurement, the reported score went **up** from 71.4% to 83.75% — because the
untested code left the sum. The check caught it anyway. That is the exact way a
coverage number lies, and it now cannot.

### The backup is restored every night

Before: a copy of the database was taken nightly and filed away. The only evidence
it was usable was that the export command did not complain.

Now: every night the backup is **actually loaded back into a database** and checked
— every table that should have rows has them, and nothing vanishes on the way in. A
half-copied file, or a perfect copy of an empty database, is now caught the same
night instead of during a real emergency.

### The trap that cost a deploy is caught before you push

There is a second, hidden shopping list in this project that only the garment-
processing service reads. Changing the main list without updating it breaks the
deploy — and *every single local check passes* while it is broken, because none of
them read that file. It cost a deploy in August.

It is now checked in seconds, locally, every time the tests run.

### The emergency instructions are checked against reality

The page you would open *during* an outage told you to run a specific version of a
tool. The project had moved on and the page had not. That is now checked
automatically — along with the names of the three services, so an instruction can
never point at something that no longer exists.

### A full parts list, with a legal check

The project now produces a complete inventory of all **1,067** software components
it depends on, and refuses to build if any of them carries a licence a commercial
product cannot use. Zero problems today. The value is later: when the next
compromised package is announced, "were we using it, and which version?" has a
filed answer.

### Speed is watched, not remembered

The real numbers a customer experiences were measured by hand last week. They are
now measured **every week automatically** against thresholds, and re-verified today:
page 0.77 s, product data 3.11 s, health 0.38 s — all comfortably inside.

---

## The four things still not perfect, honestly

**1. The master garment file still has only your copies (row 7).** You declined an
automated backup, and that decision stands. Nothing in the repository can change it.
The checksum that proves an outside copy is genuine is still in place.

**2. The 3D file is still 27 MB, about 19 seconds to download (row 6).** Making it
smaller means changing the artwork-shrinking settings, and this project's most
expensive lesson is *do not tune those against a number*. Not attempted, on purpose.

**3. Photos are still served at one size (row 6).** Phone users still download
desktop-sized images. Real, small, and a genuine piece of work rather than a
setting.

**4. Some deeper security tooling needs a paid plan (row 5).** GitHub's built-in
build-provenance signing and code scanning both need a public repository or a paid
tier. Your entire budget is $5/month and it is spent. The parts list above is the
in-house substitute, and it is a good one.

---

## The one number that matters most

**846** automatic checks, of which a large share are **negative controls** — tests
that deliberately break something and demand the alarm goes off.

That is the discipline this project keeps returning to, and it is the right one.
Every safety check added today was verified by breaking it on purpose first:

- the coverage gate, by deleting a report
- the backup verifier, by truncating a dump mid-sentence
- the module boundaries, by planting a forbidden import in two places
- the licence gate, by feeding it an AGPL package
- the version-drift check, by splitting TypeScript across two versions
- the speed probe, by simulating the exact 403 that Cloudflare produces

A check that has never been seen to fail is not yet a check.

---

*Based on a working session on 2026-08-13, with every gate run end to end
afterwards: lint, 5/5 typecheck, 846 tests, alert-shell, lockfile sync, SBOM, build,
bundle budget, container typecheck, and the artwork eval (1.650 / 3.070 / 9.370
against a 5.000 ceiling — identical to the numbers recorded in CI, which is what
confirms nothing in the pipeline moved).*
