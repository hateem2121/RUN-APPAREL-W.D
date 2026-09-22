# Buyer Journey Protocol — the 10 tag scans

**Status (2026-09-22): PROTOCOL READY.** Ten sessions not yet run; the outreach
template in §7 is what starts them. Results go in dated, pseudonymised evidence
files (`docs/BUYER-EVIDENCE-YYYY-MM-DD.md`), never in this one.

---

## 1. Why this exists

Every gate in this repository measures the machine. `docs/SCORECARD-2026-08-13.md`
reads 96/100 and answers "is CI green" — not "did a buyer scan the tag and understand
the print". The root CLAUDE.md states the product thesis plainly: **"the 3D loads" is
not success — the printed artwork IS the product.**

No automated gate can answer the four questions that decide whether this product
works, because all four are asked of a human on their own device:

1. Did it load — on *their* phone, on *their* network?
2. Could they read the chest print without being told where to look?
3. Did they turn it, and switch colour, without help?
4. Would that experience have helped them buy?

This protocol is how those four get answered ten times, dated, in a form the scorecard
rewrite can cite. It deliberately produces **evidence, not opinions**: every session
records observed behaviour first and answers second.

## 2. The journey under test

One printed QR code, one phone, no wifi supplied by us:

```
printed tag / QR
  → https://viewer.wear-run.help/<product-slug>/<colourway-slug>
  → colourway payload  (cms.wear-run.help, public read API)
  → GLB + poster       (media.wear-run.help)
  → first render on device GPU
  → turn · zoom · switch colourway
```

Per-hop success criteria:

| Hop | Success | What to record when it fails |
|---|---|---|
| Tag → URL | Opens in the default phone camera, no app install | Which camera/OS refused |
| Payload | Returns the right product and colourway | URL they ended on; any "no longer active" notice |
| Bytes → render | First model visible, and how long it took | Seconds to first render; network type (4G/5G/wifi) |
| Fallback | Poster shown **only** if the model legitimately cannot render | The poster appearing for a garment that should render — a defect by definition |
| Interaction | Turns with one finger, pinch-zooms, colourway tabs swap the garment | Anything they tried that did nothing |

The failure that matters most is the quiet one: **a fallback poster shown for a
garment that should have rendered.** Every existing gate tests the machine path; none
tests the path a real buyer's thumb takes.

## 3. Recruiting the ten

- **Who:** real B2B garment buyers — the product's actual audience. Target a spread:
  teamwear/club kit buyers, activewear brands, and at least two who have never seen a
  3D product view before (novices catch what power users forgive).
- **How many:** ten sessions, one per prospect. Quantity is the point — one session is
  an anecdote; ten dated ones are a pattern.
- **Where:** remote, on their device, on their network. A session on our machine tests
  our machine.
- **Consent:** tell them plainly that the session is recorded as notes and published
  pseudonymised in a public repository. Nothing identifying goes in a commit — this
  repo has been public since 2026-09-10, and supplier, factory and customer data never
  enters it.
- **The tag:** print the QR for a live product/colourway pair (§2's URL shape), or send
  the link directly when no physical tag is practical — note in the evidence file which
  of the two it was, because scanning a printed code and tapping a link are different
  journeys.

## 4. The session script (~5 minutes)

Say only: *"Scan this, and tell me what you think."* Do not narrate the features —
the first-time user's confusion is the measurement.

Then observe, in order, and write down what happened rather than what you inferred:

1. **Load** — did it open? Count seconds aloud to first garment (their reaction to the
   wait is data too).
2. **The print** — ask: *"Can you tell what's printed on the chest?"* Record yes / yes
   after zooming / no. Never point at the print first.
3. **Turn it** — watch whether they rotate unprompted. Record what they tried.
4. **Colour** — do they find the colourway tabs? Do all five respond? Do the names
   match what they see?
5. **The verdict** — one open question, always last: *"Would this help you buy?"*
   Record the answer verbatim (in notes, pseudonymised).

Anti-patterns: do not demonstrate first, do not ask leading questions ("Easy, right?"),
do not run it on your own phone to save time, do not skip a session because the buyer
"was busy" — reschedule it.

## 5. Evidence file — one per run date

Create `docs/BUYER-EVIDENCE-YYYY-MM-DD.md` (dated by the day the batch ran) with this
shape:

```markdown
# Buyer evidence — YYYY-MM-DD

Sessions: N of 10 · devices/networks seen: … · tags used: printed QR / link

| # | Segment (no names) | Region | Loaded? | s to first render | Read the chest print? | Turned unprompted? | Found colourways? | Fallback shown? | Verbatim verdict (redacted) |
|---|---|---|---|---|---|---|---|---|---|

## Defects found that no CI gate could have caught
- (what the buyer did → what went wrong → date seen)

## What we changed because of this
- (filled in later; an evidence file with no follow-through is a dead record)
```

**Redaction rule:** buyer index numbers and segments only ("Buyer 03, teamwear,
GCC"). No names, no company names, no email addresses, no tech packs, no pricing —
in the evidence file *or* the commit message. When a defect needs an upstream issue,
file it describing the behaviour, never the person who hit it.

## 6. Done when

- Ten dated sessions recorded across at least two device/network classes, **and**
- at least one concrete defect found that no CI gate could have caught — the run's
  entire justification — **and**
- each defect either fixed or filed, referenced from the evidence file.

## 7. Outreach template (the send, kept deliberately boring)

First-person, one ask, no pleasantries — personalise the opening line to something
specific about the recipient before sending, and delete this note.

**Subject options**

- A (signal-led): `3D review for {{Company}}`
- B (question-framed): `Can your team judge a sample in 3D?`
- C (functional): `Two-minute garment scan`

---

{{signal-anchored opening — one line about their line, season, or recent move}}

We prototype every garment in CLO 3D before a physical sample leaves Sialkot, and I
have put that same model behind a scan link: the tag opens the full garment on a
phone — turn it, zoom the chest print, switch colourways.

I am not asking for a demo call. Scan the link below on your own phone, take two
minutes, and reply with one sentence: could you judge the print and the colour from
that screen alone? That answer decides what we build next, and your tech packs
reviewed against our 3D sampling flow are on me either way — no obligation.

If sourcing sits with someone else on your team, send it their way and I will pick
it up there.

{{live link: https://viewer.wear-run.help/<product-slug>/<colourway-slug>}}

Hateem Jamshaid
Business Development Director | RUN APPAREL (PVT) LTD
team@wear-run.com | wear-run.com | wear-run.com/catalogue

---

Rules that govern this template: one action path (scan → one-sentence reply); no
claims RUN cannot document (certifications are supplier-level, lead times are typical,
never superlatives); 100% B2B — the link is a buying tool, never a shop.

## 8. Where the evidence goes

The scorecard rewrite (`docs/SCORECARD-2026-08-13.md` is the one it replaces) takes
its primary numbers from these files: success rate per session, print-read rate,
time-to-first-render observed in the wild, fallback incidents, and the verbatim
buyers' verdicts. Machine metrics stay, demoted to a secondary section — a composite
that mixes "CI is green" with "buyers succeeded" hides the second behind the first.
