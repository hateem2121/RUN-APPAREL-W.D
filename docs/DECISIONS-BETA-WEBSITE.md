# Settled decisions — the beta website

**In plain words:** The choices already made for our public website, so nobody re-decides them.

Every row here is an **owner decision**, taken on the date shown, with the evidence
that was in front of them at the time. They are recorded for the reason
`docs/DECISION-UI-LIBRARIES.md` exists: on 2026-08-15 a session researched a
question from scratch that had already been settled, because the answer was
written somewhere nothing loaded. A decision nobody can find is a decision that
gets re-taken.

**Read this before "fixing" anything below.** Several of these look like defects
and are not. Each carries the guard that stops it drifting, so a change that
contradicts one goes red rather than shipping.

The findings referenced (`FA-…`) are from the 2026-09-06 beta-website audit, kept
privately since 2026-09-10.

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

**Guard:** `apps/cms/src/publicSite.test.ts` asserts that the gallery's product links
resolve to the viewer host, and that every page building such a link renders the
caption once per link — **"Opens the 3D viewer ↗"**, the owner's wording of 2026-09-17.
`apps/cms/e2e/viewerCue.spec.ts` checks every such link on `/products` and `/`, in both
themes, the caption's contrast included. Until 2026-09-17 only the host was tested, so
the "marked as leaving the site" half of this guard existed here and nowhere else
(audit XS-09).

### D3 · The contact page gets a form — `FA-I-06`

**Decision: add a form. Every submission is stored in the CMS first, then
emailed.**

Reversed from the audit's position. The audit scored "no form" an 8 and called it
defensible, on the grounds that a form with nowhere to send its contents is worse
than no form at all — that reasoning stands, and is why the delivery design is
part of this decision rather than an implementation detail.

**Store-then-notify, in that order.** The inquiry is written to the database
before any mail is attempted, so a mail outage costs a notification, never the
inquiry. This is the same discipline as
`apps/cms/CLAUDE.md`'s rule that a write is verified by reading it back rather
than by a status code.

Email and WhatsApp links stay. The form is an addition, not a replacement — a B2B
buyer who wants a record of what they sent still has one.

**Guard:** a test asserts the inquiry row exists after a submission whose mail
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

Every garment is made to order and quoted per inquiry, so there is no price to
publish, and inventing one to satisfy a search engine is not an option. The
correct expression of "price on application" is a declared availability and
business function rather than a number.

**Guard:** `apps/viewer/worker/preview.test.ts` asserts the offer is present and
says `MadeToOrder`, and — separately — that the WHOLE serialised block matches
neither `"price…": <digit>` nor `"priceCurrency"` nor `"priceSpecification"`. The
second assertion is the one that matters: the failure worth guarding is a number
appearing beside a garment in a search result that nobody chose, and it could
arrive as `price`, `lowPrice`, `highPrice` or one level down inside a
`priceSpecification` a later edit adds. Checking one property would pass while any
of the others shipped. Negative control observed: with `price: '49.99'` injected,
it fails and names the block.

⚠️ **The second sentence of this decision went unimplemented for a day, and the
code argued the opposite in prose.** `buildProductJsonLd` carried "NO `offers`,
DELIBERATELY", and its test asserted `offers` was *undefined*. That was a
defensible reading of the same decision — Google's Product docs want a price, and
a fabricated one on 55 public URLs is worse than a rich result you do not get —
but it is not what D10 says. Put to the owner again on 2026-09-07 with the price
risk stated plainly, and the answer was unchanged: declare made-to-order, no
numbers. Implemented that day.

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

## 2026-09-07, later — three more, after the fixes were visible

### D15 · The vertical rhythm becomes 10 / 16 / 24 — `FA-B-02`, `FA-B-72`

**Decision: tighten the headline-to-lede gap from 22px to 16px.**

The page's three vertical relationships measured **0 / 22 / 24** — eyebrow to headline,
headline to lede, lede to actions. The 0 was a defect and was fixed separately (now 10).
The other two are 2px apart, which no reader can distinguish, so a page needing three
levels of relationship had one gap and one collision.

22px had a defensible provenance — a 1.3× measure against 17px body type — but provenance
is not perceptibility. All three values are already on the twelve-step allowlist, so
`docs/DESIGN.md`'s locked scale is untouched and no thirteenth step is invented.

This supersedes the deferred `FA-B-73`, which asked whether the scale needed a new step.
It does not.

### D16 · The 3D page's floating pills stay — `FA-R-51`

**Decision: leave them, and record what the research says. Nothing to change.**

The audit found "two floating pills on top of the garment". Researched against current
guidance and then checked against the code, that description turns out to cover two
different things:

- **The interaction hint** ("DRAG TO ROTATE · PINCH TO ZOOM") is *transient*. It is
  once-per-visit, dismissed on the first real interaction, and
  `apps/viewer/e2e/motion-and-layout.spec.ts` already asserts that **it stays gone** —
  "a cue that returns punishes the buyer comparing five colourways".
- **The camera pill** (FRONT / BACK / SIDE) is a control, not a hint, and is persistent
  by necessity.

So one pill is permanent, not two — and the moment the audit measured is the one moment
the hint is *supposed* to be there. Current guidance for 3D commerce viewers is explicit
that a viewer with no visible affordance "often functions as an unusually heavy static
image", and that progressive disclosure should retire the hint once the visitor engages.
That is exactly what this already does. The icon paired with the word "Pinch" follows
Baymard's gesture research, for a catalogue sold outside the English-speaking world.

Every alternative placement was examined and each collides with something else;
`apps/viewer/src/styles/page.css` records the bottom-left corner being clipped by the hint
on a real iPhone. **Do not move these without a real device in hand.**

### D17 · Empty product families keep their filter, showing zero — `FA-I-03`

**Decision: leave Teamwear & Uniforms, Casual Wear and Sports Accessories in the gallery
filter with a count of 0.**

They are part of what the company makes, and the home page advertises five families —
hiding three would mean a visitor reads five and is offered three, which looks like a
fault. The count is honest, the chip is dashed rather than dimmed (dimming failed contrast
at 2.19:1), and clicking one gives a designed message offering to send what exists.

It resolves itself as references are built; nothing needs doing again.

---

### D18 · Camera momentum stays declined — `FA-H-22`, `FA-H-51`

**Decision: no momentum. Confirmed 2026-09-07, first taken 2026-08-21.**

A flick that keeps the garment spinning after the finger leaves. It was put to the owner
on 2026-08-21 alongside the Lenis glide and **declined then**; the full-site audit raised
it again as two separate findings because **that decision was never written down anywhere
a later session would find it.** That omission is the reason it resurfaced, and this entry
exists to stop a third pass.

The case against acting is not only the earlier decision. Momentum on a 3D camera has to
be tuned on a real device — an emulator's synthetic flick has no relationship to a thumb —
and the camera already comes to rest **437.9 ms** after a release (measured 2026-09-07,
`apps/viewer/e2e/camera-settle.spec.ts`, over 285 frames with the camera travelling 92.6°).
That is responsive rather than sluggish, which is the complaint momentum would answer.

**Guard:** none. This is a decision not to act, and the record is the point.

### D19 · AI crawlers are welcomed by name, and no reuse rights are granted — `FA-N-17`

**Decision: name them, allow them, and leave the training question to the owner.
2026-09-07.**

`robots.txt` said nothing about AI crawlers, so "are we open to them?" had no answer on
the site — and on this domain that question already has a history. Cloudflare's managed
robots.txt was prepending nine `Disallow` lines and a `Content-Signal: ai-train=no` to the
served file until the owner turned that feature off on 2026-09-04, so reading the file in
the repo told you nothing about what a crawler actually received.

Twenty-four AI crawlers are now named explicitly, with the same `Allow: /` and the same
two refusals as everyone else. The policy has not changed; it is now legible in the served
file rather than inferred from a wildcard.

**What was deliberately NOT done: a `Content-Signal` line.** Cloudflare's policy expresses
reuse preferences as `search=`, `ai-input=` and `ai-train=`. `ai-train` grants or refuses
permission to train models on this company's product photography and copy, which is a
business decision and not a developer's to make in a config file — and it is exactly the
line the owner removed three days earlier by turning the managed file off. Google and Bing
ignore the field in any case; its value is as a stated preference with possible future
legal weight, which is another reason it should be the owner's words. It is on
`docs/OWNER-CHECKLIST.md` §9 as a one-line yes/no. Omitting a signal is defined by the
policy as expressing no preference, which is the honest state today.

**Guard:** `apps/cms/src/lib/robotsTxt.test.ts` asserts every group — wildcard and named
— carries the same `Disallow` list, because a named group REPLACES the wildcard group for
that agent rather than adding to it. (It lived at `app/robots.test.ts` until D20 turned
`/robots.txt` into a route handler; the citation gate caught the move, which is what it
is for.) A tidy edit that
writes `User-Agent: GPTBot` + `Allow: /` and stops there hands every AI crawler the admin
panel while making the file read more welcoming than before.
`apps/cms/e2e/findability.spec.ts` re-checks it on the served file.

### D20 · AI may read and answer, but not train — `FA-N-17`

**Decision: `Content-Signal: search=yes, ai-input=yes, ai-train=no`. Owner, 2026-09-07.**

Asked as one question with the consequence of each answer stated. The owner refused
training on the company's photography and copy and put the objection on the record.

- `search=yes` — be findable. The point of the site.
- `ai-input=yes` — let an answer engine quote the real capacity figures to a buyer who
  asks, with a link back. This is what "make the site readable to AI" (D19) was for.
- `ai-train=no` — the objection.

⚠️ **It is a stated preference, not a block, and the owner chose it on that basis.**
Google and Bing ignore the field; a badly-behaved scraper ignores everything. What it does
is put a reservation of rights in machine-readable form, which carries weight in the EU.

**And the stronger move WAS then taken — same day, on evidence.** The owner asked what
best practice was rather than choosing from options, so it was researched and recommended:
`Disallow: /` for the five training-only crawlers — GPTBot, Google-Extended,
Applebot-Extended, CCBot, Bytespider — while every crawler that reads in order to ANSWER
stays welcome.

⚠️ **It costs nothing a buyer would notice, and that is measured rather than assumed.**
Blocking GPTBot has no measurable effect on ChatGPT citations, because `OAI-SearchBot` is
what produces them and the two are independent access decisions
(https://cloro.dev/research/ai-crawler-blocks/). Blocking `Google-Extended` affects neither
Search ranking nor AI Overviews eligibility, both of which run off Googlebot
(https://aicrawlercheck.com/blog/google-extended-vs-googlebot). Every one of the five has a
sibling that stays allowed.

⚠️ **`ClaudeBot` is deliberately NOT on the refused list.** It is plausibly a training
crawler by the same pattern, and that could not be established to the standard the five
above meet. An over-block costs a lead and is invisible.

⚠️ **The refused group carries NO `Allow:` line.** Most crawlers resolve a conflict by
longest match, and `Allow: /` ties exactly with `Disallow: /` — so adding one "for
consistency" with the other two groups quietly re-opens the crawl while the file still
reads as a refusal. Asserted in both the unit and the browser test.

The `Content-Signal` stays on the refused group too: the refusal and the reason are not
the same statement, and a crawler that ignores the `Disallow` should still meet the
objection.

**This forced a mechanism change.** Next's `robots.ts` convention emits only
`User-agent`, `Allow`, `Disallow`, `Sitemap` and `Host` — there is no representation for
`Content-Signal` and no escape hatch. `/robots.txt` is now a route handler over
`src/lib/robotsTxt.ts`, and the old `app/robots.ts` is **deleted**: both answer the same
URL, and leaving it would make which one wins a property of Next's internals.

**Guard:** `src/lib/robotsTxt.test.ts` parses the served text into groups the way a
crawler does — on blank lines, since a run of consecutive `User-agent` lines is ONE group
per RFC 9309 — and asserts every group carries the signal AND the disallows. That is the
failure worth guarding: a named group REPLACES the wildcard group, so a `Content-Signal`
written only in `*` never reaches the AI crawlers it is addressed to, while the file still
parses and still allows everything it should. Control observed: dropping it from the named
group alone fails exactly one assertion.

**Widened 2026-09-11, owner decision: eight crawlers, on both hosts.** `ClaudeBot`,
`meta-externalagent` and `Amazonbot` joined the five above. Each is documented by its
operator as a training crawler with a separate sibling that answers, and the siblings stay
welcome: `Claude-SearchBot` and `Claude-User`, `meta-externalfetcher`, and `Amzn-SearchBot`
and `Amzn-User`. So the rule above still costs nothing a buyer would notice (checked
2026-09-16). The viewer host serves the same refusal and the same `Content-Signal` from
`apps/viewer/public/robots.txt`, names the site's sitemap as well as its own, and
`apps/cms/src/viewerRobots.test.ts` fails if the two hosts drift.

### D21 · HSTS preload stays off — `FA-O-04`

**Decision: do not submit. Owner confirmed 2026-09-07, on my advice.**

The site already sends `max-age=63072000; includeSubDomains`. Preloading would put
`wear-run.help` on a list shipped inside Chrome, Firefox and Safari, so a browser refuses
plain HTTP before it has ever visited — protecting only the very first request a
brand-new visitor makes.

Against that: it is a one-way door. Removal takes months and ships in browser releases,
and for the whole time **every** subdomain must serve valid HTTPS — `media.`, `viewer.`,
`cms.` and anything added later. A misconfigured subdomain becomes unreachable rather than
merely insecure.

⚠️ **The header already says `preload` and that token is NOT on the wire.** Measured live
2026-09-07: `cms.wear-run.help` answers `max-age=63072000; includeSubDomains`, no
`preload`. Cloudflare owns this header at the edge and its switch is off. The declaration
in `next.config.mjs` is kept because the value and the intent are right; what would be
wrong is reading that line as evidence the site is preload-eligible. It is not, and will
not be until someone turns the Cloudflare switch on AND submits the domain.

**Guard:** none, and that is correct — this is a decision not to act on a setting that
lives outside the repository. `docs/OWNER-CHECKLIST.md` §8 carries it.

### D22 · The site smooth-scrolls like the viewer — `FA-F-06`, `XS-06`, `OI-2`

**Decision: one site, one feel. Owner's decision 5, approved with the fix plan on
2026-09-16; built 2026-09-25.** This REVERSES the 2026-08-21 and 2026-09-07 records that the
marketing site scrolls natively and Lenis is the viewer's alone.

The site now runs the viewer's smooth scroll: the same Lenis version, the same 1.1 s
ease-out glide and the same trusted-wheel predicate (`apps/cms/src/components/site/SmoothScroll.tsx`).
What made the old decision right still holds as guards, each proven by a planted fault in
`apps/cms/e2e/smoothScroll.spec.ts`: automation and reduced motion never load it; a wheel
event no person rolled is refused; touch stays the browser's own; End, Home and PageDown
stay the keyboard's; Back, Reload and the back-forward cache return to the same place.

⚠️ **Two bugs the viewer's version never showed, found by that spec on the first run.**
Lenis ignores native scrolling while it glides and writes its own position every frame, so
End pressed mid-glide was pulled back up, and a link clicked mid-glide left the NEW page at
the old page's target (Next put it at the top, the next frame put it back). The site's
version ends a glide at the moment of intent: a pointer press, a scrolling key, Back/Forward.

**Guard:** `apps/cms/src/auditGuards.test.ts` (FA-F-06 / XS-06: one file, dynamic import,
the viewer's version and duration, the predicate, no `scroll-behavior: smooth`) and the
browser spec above.

## Closed since

**`FA-B-73` — RESOLVED by D15, and its premise was wrong.** The audit reported a gap
between 24px and 52px in the spacing scale. That 52px is a *measured median produced by
fluid `clamp()` values*, not a literal anyone typed, so there was no missing step to add.
The real problem sat next to it — two gaps 2px apart — and D15 fixes that with values the
scale already has. No thirteenth step.

**`FA-I-10` — ANSWERED 2026-09-07.** The owner supplied capacity, minimum order, sample
and shipment lead times, headcount, floor area, export markets and the certification
position. All of it is on the home page under N°03; nothing was published that they did
not confirm. The certification wording names the actual certificate holder — see the note
in that commit.

## Still open

**`FA-Q-07`'s sibling: the Resend domain — the DOUBT was unfounded, checked 2026-09-07.**
This said the domain "may not be verified for sending" because `wear-run.help`'s SPF names
Hostinger, Google and SendGrid and not Resend. The premise was a misreading: Resend sends
through Amazon SES, so SPF is evaluated against the ENVELOPE sender, not the `From:`
header. All three records Resend requires are present —
`send.wear-run.help` TXT `v=spf1 include:amazonses.com ~all`, `send.wear-run.help` MX
`10 feedback-smtp.us-east-1.amazonses.com`, and a 218-character key at
`resend._domainkey.wear-run.help`. DMARC is `p=quarantine` and aligns both ways: SPF
relaxed (`send.wear-run.help` and `wear-run.help` share an organisational domain) and DKIM
strict (`d=wear-run.help`).

⚠️ **Still not PROVEN, and the gap is named rather than closed.** DNS shows the records
exist; it cannot show that Resend's dashboard has ticked the domain Verified, nor that the
API key on the Worker is still valid. Both are behind a login. The cheap proof is one form
submission after launch — and the inquiry is stored before the email is attempted, with
the failure written onto the row, so a wrong answer costs a notification and never a lead.
`docs/OWNER-CHECKLIST.md` §7a.
