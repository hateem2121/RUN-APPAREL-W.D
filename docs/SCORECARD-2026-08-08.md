# Project scorecard — 2026-08-08

Plain-English health check on RUN APPAREL. Written for the owner, not for a
developer.

**The question this answers:** *can we add more garments and start sharing these
with our leads?* Every score is measured against that, not against "could this
survive being a huge public website."

---

## Overall: 79 / 100

Think of the project as a car.

**The engine is excellent.** Better built than most projects twice its age. It's
been crash-tested, it has alarms fitted, and the manual is genuinely good.

**The problems are all in the last mile** — the bits between "it works" and "a
buyer is impressed." Sharing a link, undoing a mistake, and putting the *second*
garment through. Those are cheaper problems to fix than engine problems, which is
good news.

---

## The eight scores

### 1. Does it actually work? — 82/100

Yes. The real garment is live, in 5 colours, and the printed logo on the chest has
been checked with actual pictures — not just "the file loaded."

What's missing: no **AR** (a buyer can't point their phone at their desk and see
the garment there), no **QR code generator** built in (you make those on an
outside website), and the site is **English only**.

### 2. Will it break? — 88/100

Unlikely. There are **358 automatic checks** plus **19 more** that drive a real
browser — five different browsers, including iPhone. Nothing reaches the live site
unless all of them pass.

Two nice details: the code has **zero** places where a developer told the computer
"trust me, skip the check" — that's rare. And there's a test that renders your
actual logo before and after processing and measures how much it moved, so nobody
can quietly ship a setting that smudges your artwork.

What's missing: no automatic style checker, and nobody measures *how much* of the
code the tests actually cover.

### 3. If it breaks, will you know? — 84/100

Yes. The site is pinged **every 15 minutes**. Every 6 hours, a second watchman
checks *the first watchman is still alive* — because twice already an alarm broke
silently and nobody noticed for a day. Errors from real visitors' browsers get
reported too.

The weak point: every alarm ends up as a GitHub notification **to one person —
you**. If you're on a plane, nobody else is watching.

### 4. Can you fix it fast? — 68/100 ⚠️ *lowest score*

Half of this is strong. The database is backed up every night, and someone
actually *practised* restoring it — which is how they found the restore
instructions were broken. That's the right way round.

Half is missing. **There is no written way to undo a bad update.** If a change
goes out and breaks the site while a lead is looking at it, there's no page
anywhere that says "here's how to put it back." Cloudflare supports this; the
project just never wrote it down.

### 5. Is it safe? — 83/100

Good. No passwords or keys are stored in the code, and a scanner blocks the update
if anyone ever pastes one in by accident. The login locks after 5 wrong tries. The
browser is told exactly which code it's allowed to run.

The gap: the **public part of the site has no traffic limit**. Cloudflare's free
plan allows exactly one such rule and it's already used on the login page.

### 6. Is it fast and usable for everyone? — 80/100

Fast: there are hard size limits on the site's files, and the update is blocked if
they're exceeded. Heavy 3D code only downloads when it's actually needed.

Usable: this is better than most commercial sites. Screen-reader and keyboard
checks run automatically against **five** situations including things going
*wrong* — most projects only test the happy path.

The gap: photos are served at whatever size they were uploaded, so phone users
download desktop-sized images.

### 7. Can someone else pick it up? — 86/100

Yes, unusually so. The documentation is genuinely excellent — and it *corrects
itself*, recording where earlier versions were wrong. That's rare and valuable.

The gap: **a few pages have gone stale** (see fixes 4 and 5 below), and one
feature was half-built and forgotten.

### 8. Can you add garment #2 without a developer? — 72/100

Mostly. The process is automated end to end: upload the CLO file, it gets shrunk
automatically, the colours are **named by measuring the actual file** rather than
typed by hand, and error messages are written in plain English with a "what you do
about it" column.

Importantly, nothing in the code is hard-wired to N001 — garment #2 needs no
programming.

The gaps: the guide you'd follow is out of date (fix 4), you make QR codes on an
outside site, and — the subtle one — **the artwork check that runs on your real
garment file cannot run on a new garment.** It's locked to N001's exact file. A
new garment gets only the simpler synthetic check.

---

## How the scores work

| Range | Means |
|---|---|
| 90–100 | Proven working, and something automatic stops it breaking again |
| 70–89 | Works and is tested, but a human has to remember something |
| 50–69 | Works today, would break quietly as you grow |
| Under 50 | A known gap that will bite you on garment #2 or #3 |

---

## What to fix first

Ordered by *what would embarrass you in front of a lead*, not by technical
severity.

### 1. Your raw master garment file is on a clock ⏰

The original 382 MB CLO export gets **automatically deleted from Cloudflare around
2026-08-19** — that's about 11 days away. Nothing backs up that storage area. After
that, the only copy in the world is on your laptop.

**Fix:** copy it somewhere else today. *Minutes.*

### 2. A link you send a lead shows no picture

Paste a viewer link into WhatsApp, email or LinkedIn and the lead sees the title
and one generic sentence — **the same sentence for every garment and every colour**
— and **no image at all**.

This is the single most on-target gap for "start sharing these with our leads."
It's the difference between a link that looks like a product and a link that looks
like spam.

**Fix:** add preview tags, with the garment's own poster as the image. *A few
hours.*

### 3. No way to undo a bad update

Covered in score 4. If a deploy breaks the site, there's no written recovery path.

**Fix:** write down and test the rollback command. *About an hour.*

### 4. The guide for adding garment #2 tells you not to show customers

`docs/FIRST-GARMENT-UPLOAD.md` — the plain-English guide you'd actually follow —
still says N001 has no 3D model, and still says the artwork is broken and the
system is *"not yet ready for a garment you would show a customer."*

Both were fixed on **2026-08-05**. The guide never got the memo.

**Fix:** update those two sections. *Minutes.*

### 5. The emergency manual is wrong about one thing

`docs/RUNBOOK.md` still describes the browser security error as unsolved, blames
the wrong cause, and recommends a fix that was **measured not to work**. The real
cause was found and fixed on 2026-08-06 — the notes elsewhere were corrected, this
page was missed.

This matters because the runbook is what you'd open *during* a problem.

**Fix:** replace that section. *Minutes.*

### 6. Garment #2 gets no real-file artwork check

Covered in score 8. The strongest artwork test only accepts N001's exact file.

**Fix:** make it work for any garment. *A full session — this one's real work.*

### 7. A pipeline change can skip the artwork gate

There are two separate update paths. The main one runs every check. The other —
the one used when changing **the artwork-shrinking code itself** — runs only the
basic checks and skips the artwork test. That's exactly backwards.

**Fix:** add the missing checks to that path. *About an hour.*

### Below the line

Worth knowing, not urgent: no QR generation in the CMS, no traffic limit on the
public part of the site, and no AR.

---

## A note on what's *not* wrong

Worth saying plainly, because the fix list above is longer than the praise:

The things that usually sink a project like this — untested code, secrets leaked
into the repo, no backups, no monitoring, nobody able to understand it later — are
all **handled here, and handled well**. Several are handled better than at
companies with real budgets.

The fixes above are last-mile polish and paperwork. Six of the seven are an hour
or less.

---

*Scores are based on a read-only review of the repository on 2026-08-08. Anything
about live Cloudflare settings reflects what was last verified in the notes
(2026-08-07) — the code alone cannot confirm current live state.*
