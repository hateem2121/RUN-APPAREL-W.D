# Settled decisions — the beta website

Every row here is an **owner decision**, taken on the date shown, with the evidence
that was in front of them at the time. They are recorded for the reason
`docs/DECISION-UI-LIBRARIES.md` exists: on 2026-08-15 a session researched a
question from scratch that had already been settled, because the answer was
written somewhere nothing loaded. A decision nobody can find is a decision that
gets re-taken.

**Read this before "fixing" anything below.** Several of these look like defects
and are not. Each carries the guard that stops it drifting, so a change that
contradicts one goes red rather than shipping.

The findings referenced (`FA-…`) are from `docs/AUDIT-BETA-WEBSITE-2026-09-06.md`.

---

## 2026-09-07 — the thirteen re-opened after the full-site audit

The audit scored 236 checks and flagged twelve settled trade-offs whose *premise*
had changed since they were taken — most often because the catalogue grew from 11
products to 67. Each was put back to the owner individually with what had changed.
A thirteenth (`FA-Q-07`) was a factual confirmation rather than a trade-off.

### D1 · The gallery gets filters, and stays on one page — `FA-I-08`

**Decision: add family filters. No pagination, no "load more".**

The original choice — one ungated list — was correct at 11 products. At 67 the
page measures **45.8 phone screens**, so a buyer looking for one jacket scrolls
past 66 other garments.

Filters were chosen over pagination because every garment stays in the HTML: a
crawler still sees all 67 on one URL, and the page still works with scripting
off. Pagination or a "load more" button would have traded that away for a faster
first paint the page does not need — it already paints in **720–724 ms** on a
throttled connection (`FA-L-61`).

**Guard:** a browser test asserts every published product is present in the DOM
on `/products` regardless of the active filter, and that the page renders its
full list with JavaScript disabled.

### D2 · The 3D viewer stays the product detail page — `FA-I-07`

**Decision: no per-product page on the marketing site. Keep linking out to
`viewer.wear-run.help`.**

The viewer already is the detail page: it renders the garment in 3D, carries the
fabric, GSM, fit and customisation copy, and is the address printed on physical QR
tags. Duplicating it on the marketing site would mean two pages describing one
garment, which is worse for search engines than one, and two places for the copy
to drift.

What the audit correctly flagged was not the split but the *unsignalled* domain
change. That is treated as a defect and fixed (see `FA-N-09`, `FA-W-01`), not as a
reason to rebuild the page.

**Guard:** a test asserts the gallery's product links resolve to the viewer host
and are marked as leaving the site.

### D3 · The contact page gets a form — `FA-I-06`

**Decision: add a form. Every submission is stored in the CMS first, then
emailed.**

Reversed from the audit's position. The audit scored "no form" an 8 and called it
defensible, on the grounds that a form with nowhere to send its contents is worse
than no form at all — that reasoning stands, and is why the delivery design is
part of this decision rather than an implementation detail.

**Store-then-notify, in that order.** The enquiry is written to the database
before any mail is attempted, so a mail outage costs a notification, never the
enquiry. This is the same discipline as
`apps/cms/CLAUDE.md`'s rule that a write is verified by reading it back rather
than by a status code.

Email and WhatsApp links stay. The form is an addition, not a replacement — a B2B
buyer who wants a record of what they sent still has one.

**Guard:** a test asserts the enquiry row exists after a submission whose mail
step is forced to fail.

### D4 · The gallery grows to four columns above 1600px — `FA-E-04`

**Decision: a fourth column on wide screens. Nothing changes below 1600px.**

The three-column cap was deliberate and remains right for phones, tablets and
ordinary laptops. On a 1920px monitor it left the same three garments as a
1280px one, with empty space either side.

**Guard:** a layout test asserts three columns at 1280px and four at 1920px.

### D5 · The viewer wordmark becomes a link home — `FA-W-02`

**Decision: the company name in the viewer header links to `wear-run.help`.**

Correct as plain text while there was nowhere to send anyone. There is about to
be. Someone who scans a QR tag on a garment currently reaches a page describing
that one garment with no route to the other 66.

**Guard:** a viewer browser test asserts the wordmark is an anchor pointing at the
site origin.

### D6 · The home page keeps its introduction first — `FA-I-18`

**Decision: section order is unchanged. The 3D pitch stays second.**

The audit argued the 3D viewer is the only real differentiator and should lead.
The owner's judgement is that for a manufacturer, credibility comes before
capability: a buyer needs to know who they are dealing with before being shown
what the workshop can do.

**Guard:** a test pins the section order, so a future "improvement" that reorders
the page has to argue with this record first.

### D7 · The footer's quiet band stays — `FA-B-03`

**Decision: keep the empty band (144–323px depending on width). Fix the
misalignment beside it.**

The space is from the approved footer design
(`docs/superpowers/plans/2026-09-05-site-footer-quiet-room.md`) and does its job.
The audit's real finding was next to it, not in it: the footer's left edge drifts
up to **370px** from the page's own left edge (`FA-D-01`). That is a bug and is
fixed; the space is not.

**Guard:** a test asserts the footer's content edge agrees with the page
container's at every audited width.

### D8 · The marketing site gets the viewer's entrance animations — `FA-H-11`

**Decision: add matching fade-ins, using the existing motion tokens.**

The two surfaces are one company and currently feel like two: the viewer reveals
its content gently, the site snaps it into place. The site's stillness was never a
recorded decision — it was simply never built.

Constraint: the existing tokens only. No new durations, no new easings, and
completely disabled under `prefers-reduced-motion`, which the viewer already
honours in full (`FA-H-07`, `FA-H-25`).

**Guard:** the existing reduced-motion tests are extended to the site's reveals,
with a negative control.

### D9 · Two-finger pan becomes zoom-proportional — `FA-H-29`

**Decision: 1:1 when zoomed out, damped when zoomed in.**

The constant damping was introduced for a real reason — at 1:1, a zoomed-in print
could be panned out of reach — and the audit measured its cost: a **120pt finger
movement moves the garment 37pt**, which breaks the sense of direct manipulation.

Scaling the gain with the zoom level gets both: direct at the default view, still
reachable at maximum zoom.

⚠️ **This must be measured on a real device, not an emulator.** The audit's own
touch findings were only trustworthy because they came from a real phone.

**Guard:** a test asserting the pan gain at both zoom extremes, with a negative
control at the constant-gain value.

### D10 · Structured data stays price-free, and says so — `FA-N-10`

**Decision: no `price` in the product structured data. Declare made-to-order and
quote-on-request explicitly.**

Every garment is made to order and quoted per enquiry, so there is no price to
publish, and inventing one to satisfy a search engine is not an option. The
correct expression of "price on application" is a declared availability and
business function rather than a number.

**Guard:** a test asserts the structured data validates and contains no numeric
price.

### D11 · Two sitemaps stay, and point at each other — `FA-N-13`

**Decision: keep one sitemap per host. Cross-reference them.**

The marketing site and the viewer are genuinely two different origins, and a
sitemap listing URLs on another host is the thing search engines warn about.
The audit's concern was that the arrangement looks accidental — so each will
reference the other, and both will be registered in Search Console.

**Guard:** the existing sitemap test is extended to assert the cross-reference.

### D12 · `Stage.tsx` is not split — `FA-T-03`

**Decision: leave the file at its current size.**

1,491 lines, roughly half of them comments recording incidents that each cost a
session. The file drives the live 3D garment on every QR scan. Splitting it trades
a real risk to a working production surface for a tidiness gain no visitor sees,
and the comments are load-bearing: the root `CLAUDE.md` explicitly records that
several traps in this repo are only discoverable from them.

**Guard:** none needed — this is a decision not to act. Recorded so the next
session does not re-litigate it.

### D13 · `partner@wear-run.com` is the correct address — `FA-Q-07`

**Confirmed, not decided.** The audit could not score this because it could not
tell whether the `.com`/`.help` split was intentional.

Measured 2026-09-07: **both** `wear-run.com` and `wear-run.help` carry live
Hostinger MX records (`mx1.hostinger.com`, `mx2.hostinger.com`) and the same SPF
record. The mail domain and the web domain differ on purpose.

**Guard:** a test asserts the address is identical everywhere it appears — the
site footer, the viewer's enquiry links, the shared defaults and the CMS setting —
so the two domains cannot drift apart in one place only.

### D14 · "EST. LINEAGE 1889" is reworded, not removed — `FA-I-12`

**Owner's statement, 2026-09-07:** *"Our family start manufacturing and exporting
back in 1889. Since then we have been doing the same."*

The claim is stronger than the wording conveyed. "EST. LINEAGE 1889" could be read
as the company's founding date, which would be wrong and is the kind of thing a
serious buyer checks. The fact — an unbroken family manufacturing and export trade
since 1889 — is unambiguous and worth stating plainly.

**Guard:** the copy is a CMS-editable field, so the guard is this record rather
than a test.

---

## Still open

**`FA-B-73` — whether the spacing scale needs a thirteenth step.** Deferred, not
avoided. The audit reported a gap between 24px and 52px, but the 52px is a
*measured median produced by fluid `clamp()` values*, not a literal anyone typed.
Whether the fix is a new literal step or a clamp changes both the work and which
gate covers it, so the question is being put back to the owner with that
measurement rather than before it.

**`FA-I-10` — checkable facts.** The owner has asked for a list of specific
questions to answer. Nothing is published until they confirm each value.
