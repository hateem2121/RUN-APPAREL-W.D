# Project scorecard — 2026-08-08

Plain-English health check on RUN APPAREL. Written for the owner, not for a
developer.

**The question this answers:** *can we add more garments and start sharing these
with our leads?* Every score is measured against that, not against "could this
survive being a huge public website."

---

## ⚠️ UPDATE — later the same day (2026-08-08)

**Five of the seven "fix first" items below are now done, and one was closed by a
decision.** The scores and the fix list underneath this block are the *morning*
reading and have been left exactly as written, so you can see what moved. Read
this block first; it is the current state.

| Fix | Was | Now |
|---|---|---|
| 1. Raw master file on a clock | ⏰ 11 days | **Closed by your decision** — you keep your own external copies and declined an automated backup. `raw/CANONICAL.json`'s checksum is what makes an outside copy *provable*, and that is still in place. |
| 2. A link you send a lead shows no picture | ❌ | **Half done, other half in progress.** A link now unfurls with a picture and a sentence — but the *same* one for every garment and colour. Per-garment previews are being built now. |
| 3. No way to undo a bad update | ❌ | **Done.** `docs/RUNBOOK.md` → "Undoing a bad deploy". |
| 4. Garment guide told you not to show customers | ❌ | **Done.** `docs/FIRST-GARMENT-UPLOAD.md` corrected. |
| 5. Emergency manual wrong about the browser error | ❌ | **Done.** RUNBOOK now names the real cause and the fix that worked. |
| 6. Garment #2 gets no real-file artwork check | ❌ | **Substantially done.** The strong artwork check is *not* locked to N001 — it takes any file, recognises which garment it is by fingerprint, and its calibration mode deliberately accepts a file it has never seen. The morning review read the refusal path and missed that one. |
| 7. A pipeline change can skip the artwork gate | ❌ | **Done.** That path now runs the same four gates as the main one. |

**And one thing was found that nothing in the scorecard predicted.** The 3D viewer
silently ignored *any* camera zoom closer than 12° — so for months the artwork
checks had been photographing a wider shot than they asked for, without
complaint. Proof: four different "zoom in" settings produced four **identical**
pictures. Two consequences worth knowing:

- The two smallest prints on N001 — the hem label and the neck logo — were listed
  as "not covered" by the artwork check. That was never a choice. **Any print
  smaller than roughly a hand was impossible to photograph closely enough to
  check.** That limit is now removed and those two prints are checkable for the
  first time.
- Nothing was actually mis-shipped. N001's own check uses a 14° view, which is
  above the old floor, and it was verified to produce a **byte-identical**
  picture before and after the fix. No calibration moved.

It was found by *looking at a contact sheet*, not by reading code — the same way
the artwork damage was found on 2026-08-05. That is now twice.

**Scores that moved:** *Will it break?* 88 → **90** (the second update path is
gated, and the automatic checks went from 358 to **411**). *Can you fix it fast?*
68 → **80** (the rollback procedure exists and is written down). *Can someone
else pick it up?* 86 → **90** (the three stale pages are corrected). *Can you add
garment #2 without a developer?* 72 → **82** (the guide is followable end to end —
before this it dead-ended at its own step 3, and there is now a command that finds
a new garment's prints and works out the camera angles for you).

**Overall: 79 → 85.** What is left is genuinely the list under "Below the line",
plus the four housekeeping jobs in the plan: a style checker, a traffic limit on
the public part of the site, an alarm that does not depend on GitHub, and one
version number that differs across the project.

---

## ⚠️ SECOND UPDATE — 2026-08-09

**Fix 2 is now fully done, and the four housekeeping jobs are closed.**

- **A link you send a lead now shows THAT garment.** Paste any viewer link into
  WhatsApp, email or LinkedIn and the card shows that colourway's own picture, its
  name — "N001 Velocity Performance Skinsuit — Wine" — and its fabric and fit. All
  five colours verified live. Adding a garment needs one command, and skipping it
  degrades rather than breaks.
- **A style checker now runs on every update**, and it earned its place within
  minutes: it found that the list telling the media-cleanup tool which files are
  "in use" was being ignored by that tool. The tool can *delete* files. Anyone
  following the project's own written instructions would have added a new file
  type to that list, seen everything go green, and left the cleaner blind to it.
- **The public feedback channel now has a traffic limit.** Anyone on the internet
  could post to it, it always answered "thanks" by design, and a flood would have
  filled the database in silence. It now drops the excess and writes a line in the
  log — the only way that would ever have been visible.
- **Two settings that never did anything are gone** — a "how the garment is shown"
  choice nothing acted on, and an analytics switch that could never have worked.
  The database column stays where it is: unused it costs nothing, and removing it
  is the single riskiest operation in this project.
- **Version numbers unified** across five of six parts. The sixth cannot move —
  Next.js refuses the newer version outright — and that is now written down so
  nobody spends an afternoon rediscovering it.
- **Alarms that do not depend on GitHub:** this is the one job that needs *you*,
  because it needs an account. Five minutes, free, and the exact two checks to
  create are in `docs/RUNBOOK.md` → "The watchman that is not us". Until you do
  it, every alarm still ends in one person's GitHub notifications.

**Scores that moved again:** *Will it break?* 90 → **92** (a style checker, and
**460** automatic checks — up from 358 — plus 66 browser runs across five
browsers). *Is it safe?* 83 → **88** (the open door now has a limit).
*Can you add garment #2 without a developer?* 82 → **85**.

**Overall: 85 → 88.** The remaining gaps are the ones under "Below the line" —
QR codes generated outside the site, no AR, and images served at one size — plus
the five-minute alarm job above.

---

## Overall: 79 / 100 *(morning reading — see the update above)*

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

⚠️ **Five of these seven are done and one was closed by your decision — see the
UPDATE block at the top before acting on anything here.** The list is kept as
written so the record shows what the morning review found.

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
