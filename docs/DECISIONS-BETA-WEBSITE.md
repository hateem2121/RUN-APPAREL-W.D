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

**Amended by D27 (2026-10-04):** the filters are gone; their addresses forward to the families'
own pages, and `/products` groups every garment under its family's heading. The reason above —
every garment in one document — still holds, and `apps/cms/e2e/oneListPerFamily.spec.ts` checks it
with scripting off.

### D2 · The 3D viewer stays the product detail page — `FA-I-07`

**Decision: no per-product page on the marketing site. Keep linking out to
`viewer.wear-run.help`.**

*Update 2026-09-28: the public site moved to `wear-run.com`. Garment pages are now `wear-run.com/products/<product>/<colour>`; `viewer.wear-run.help` forwards there for ever, because printed QR tags carry it.*

The viewer already is the detail page: it renders the garment in 3D, carries the
fabric, GSM, fit and customisation copy, and is the address printed on physical QR
tags. Duplicating it on the marketing site would mean two pages describing one
garment, which is worse for search engines than one, and two places for the copy
to drift.

What the audit correctly flagged was not the split but the *unsignalled* domain
change. That is treated as a defect and fixed (see `FA-N-09`, `FA-W-01`), not as a
reason to rebuild the page.

**Guard:** `apps/cms/src/publicSite.test.ts` asserts that the gallery's product links
resolve to the garment pages (`wear-run.com/products/…`, built from `GARMENT_PAGES`; a separate viewer host until 2026-09-28), and that every page building such a link renders the
caption once per link — **"Opens the 3D viewer ↗"**, the owner's wording of 2026-09-17.
`apps/cms/e2e/viewerCue.spec.ts` checks every such link on `/products` and `/`, in both
themes, the caption's contrast included. Until 2026-09-17 only the host was tested, so
the "marked as leaving the site" half of this guard existed here and nowhere else
(audit XS-09).

**Since polish D3b (2026-10-05) a product card's own caption shows when its ticket opens**
(the owner's X9: "the rest appears when the card opens"), and on a phone, whose sideways
ticket never opens, not at all (M1). Every link still carries the words in its accessible
name, so a screen reader hears them on every card either way, and `viewerCue.spec.ts`
measures each ticket's caption with the ticket open (closed, it is transparent).

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

**Amended 2026-10-01 (owner, visual audit VA-02): one step.** The two-step form with a
progress bar (2026-09-29) is replaced by one column with every field showing: name, email
and message first, then company, phone and files under "Optional details". Job title and
Subject left the form. After Send the form gives way to a confirmation that a reload clears
(VA-27). The rules above stand: store-then-notify, works with scripting off, email and
WhatsApp links kept. Guard: `apps/cms/e2e/inquiry.spec.ts`.

**Amended 2026-10-05 (owner, polish D7 with F10, X6 and MO5; answers Q15–Q17, Q43): the
owner's own layout.** Name + Job title, Company + Country, Email + Phone in pairs (side by
side wherever the form is 28rem wide, stacked on a phone), then Subject as six answers to tap
(the last, "Something else…", opens a box for the buyer's own words), Message, Files and Send.
Only Name, Email and Message must be filled, each with a red * that one line explains; the
word "optional" appears nowhere, which reverses W1's "Optional details" (the owner's choice:
three boxes to mark against six). One height for every box and button (48px). The country is
a box that suggests as you type and fills the phone's code; the files have a drop area, a
list with sizes and a × each, and the grey browser controls show only without scripting. The
box in use glows, a needed box rightly filled shows a tick, an early Send shakes the button
once, and the confirmation reads "Got it." under a tick that draws itself. Job title and
Subject are back on the page; the route never stopped accepting them (no migration). Guards:
`apps/cms/e2e/inquiry.spec.ts` and `apps/cms/e2e/inquiryLayout.spec.ts` (all three engines).

### D4 · The gallery grows to four columns above 1600px — `FA-E-04`

**Decision: a fourth column on wide screens. Nothing changes below 1600px.**

The three-column cap was deliberate and remains right for phones, tablets and
ordinary laptops. On a 1920px monitor it left the same three garments as a
1280px one, with empty space either side.

**Guard:** a layout test asserts three columns at 1280px and four at 1920px.

**Amended 2026-10-02 (owner, visual audit VA-42):** the fourth column now starts at **1440px**, so
the 40 garments fill ten rows of four on a 1440px screen instead of leaving one alone. 1280px keeps
three, so the guard above still holds; `apps/cms/src/productGridOrphans.test.ts` and
`apps/cms/e2e/productsGrid.spec.ts` check 1440px too.

**Amended 2026-10-04 (owner's polish plan, D1):** the page itself is wider, 1440px from a 1280px
screen and 1600px from 1920px (it was 1180px until 1600px), and a fifth column starts at **1920px**,
where five cards are about the width four have at 1440px. 1280px still has three, now wider; the
guard reads three at 1280px, four at 1440px and five at 1920px.

### D5 · The viewer wordmark becomes a link home — `FA-W-02`

**Decision: the company name in the viewer header links to `wear-run.help`.**

*Update 2026-09-28: the home address is now `wear-run.com`; `wear-run.help` forwards to it.*

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

**Amended by D23 (2026-09-29):** two sections were added and the 3D pitch is now third.
Credibility still leads.

### D7 · The footer's quiet band stays — `FA-B-03`

**Decision: keep the empty band (144–323px depending on width). Fix the
misalignment beside it.**

The space is from the approved footer design
([2026-09-05-site-footer-quiet-room.md](https://github.com/hateem2121/RUN-APPAREL-W.D/blob/bd384f3c0dc3df196047b1dd5e6d6b399bd3d4a1/docs/superpowers/plans/2026-09-05-site-footer-quiet-room.md)) and does its job.
The audit's real finding was next to it, not in it: the footer's left edge drifts
up to **370px** from the page's own left edge (`FA-D-01`). That is a bug and is
fixed; the space is not.

**Guard:** a test asserts the footer's content edge agrees with the page
container's at every audited width.

**Amended 2026-10-04 (owner's polish plan, X23 and F9):** the band stays; its range was measured
on a footer of one block. The facts gained "What we make" (four links, with every database) and
now run the column's width in up to five columns. Measured at 900px tall: with the test
database the band is 214, 208 and 126px at 768, 1024 and 1440px, so `e2e/footer.spec.ts` (DS-09)
holds it to 100–323px, a floor that still fails a band removed or squeezed to its 24px minimum.
With the live footer's five blocks the band was already at that 24px minimum at every width
before X23 (measured on wear-run.com: the slab 996–1,120px tall, past one screen), and with the
same values drawn into this build it is 24–59px, in a slab of 900–970px.

**Amended 2026-10-07 (D34):** the Company group reached five links with Press, and every footer
link is a 44px row, so the band lost 44px at every width: 170, 164 and 82px at 768, 1024 and
1440px with the test database. The floor in `e2e/footer.spec.ts` is now 48px, which still fails a
band removed or squeezed to its 24px minimum, and fails again if one more link joins the tallest
group.

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

**Amended by D26 (2026-09-29):** one new duration, `--showpiece`, for three showpiece motions.

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

**Guard:** since D38 (2026-10-11), `apps/viewer/worker/preview.test.ts` → "no product
label for crawlers (D38)": no key containing `price` may reach any structured-data
block a garment page carries. Until D38 the same file asserted the offer said
`MadeToOrder`, and — separately — that the WHOLE serialised block matched neither
`"price…": <digit>` nor `"priceCurrency"` nor `"priceSpecification"`. The second
assertion was the one that mattered: the failure worth guarding is a number
appearing beside a garment in a search result that nobody chose, and it could
arrive as `price`, `lowPrice`, `highPrice` or one level down inside a
`priceSpecification` a later edit adds. Checking one property would pass while any
of the others shipped, which is why D38's test matches every key containing
`price`. Negative control observed: with `price: '49.99'` injected, the old test
failed and named the block.

⚠️ **The second sentence of this decision went unimplemented for a day, and the
code argued the opposite in prose.** `buildProductJsonLd` carried "NO `offers`,
DELIBERATELY", and its test asserted `offers` was *undefined*. That was a
defensible reading of the same decision — Google's Product docs want a price, and
a fabricated one on 55 public URLs is worse than a rich result you do not get —
but it is not what D10 says. Put to the owner again on 2026-09-07 with the price
risk stated plainly, and the answer was unchanged: declare made-to-order, no
numbers. Implemented that day.

**Amended by D38 (2026-10-11):** the made-to-order offer and the product label are gone,
because Google reads neither without a price. The no-price rule stands and keeps its guard.

### D11 · Two sitemaps stay, and point at each other — `FA-N-13`

**Decision: keep one sitemap per host. Cross-reference them.**

The marketing site and the viewer are genuinely two different origins, and a
sitemap listing URLs on another host is the thing search engines warn about.
The audit's concern was that the arrangement looks accidental — so each will
reference the other, and both will be registered in Search Console.

**Guard:** the existing sitemap test is extended to assert the cross-reference.

### D12 · `Stage.tsx` is not split — `FA-T-03`

**Decision: leave the file at its current size.**

1,491 lines (1,634 on 2026-10-24), roughly half of them comments recording incidents that each cost a
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

**Amended by D37 (2026-10-11):** the site shows inquiry@wear-run.com now, an alias of team@;
partner@ is shown nowhere.

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

**Amended by D27 (2026-10-04):** the chips jump to groups on the page instead of filtering it; an
empty family keeps its dashed chip and its 0, and its group carries the message.

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

Twenty-four AI crawlers (27 by 2026-10-24) are now named explicitly, with the same `Allow: /` and the same
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

## 2026-09-29 — the owner's ten-point review of the home and contact pages

### D23 · The home page tells who, what, how, then proves it — amends D6

**Decision: hero → №01 Who we are → №02 What we make → №03 3D → №04 How an order works →
№05 The numbers → №06 Inside the factory → №07 Talk to us.** The owner asked for the page to
say who the company is, what it does and how an order runs, and delegated the order to the
research ("you decide according to the latest studies").

The research, in short: B2B visitors judge credibility first and fast
(https://www.kalungi.com/blog/your-homepage-is-a-trust-machine); a guide earns the right to
propose a plan by showing authority, then a short plan makes starting feel safe, then the
call to action (StoryBrand, https://www.impactplus.com/blog/what-is-the-storybrand-framework);
and 67% of B2B buyers prefer to research without a salesperson, so the page must answer "what
happens if I contact you?" on its own (Gartner, March 2026,
https://www.gartner.com/en/newsroom/press-releases/2026-03-09-gartner-sales-survey-finds-67-percent-of-b2b-buyers-prefer-a-rep-free-experience).
D6's point — credibility before capability — is kept; the 3D pitch moves from second to third.

Every section now carries its own media (the owner: "each section must also have their media"):
the hero is the stitching floor, №01 the building and its roof, №02 a real product per family,
№04 one factory photo per phase, and №06 keeps the full gallery.

The timeline says only what the owner confirmed for EVERY order: a free quote, the sample fee
credited back against bulk, and nothing into bulk before the buyer signs off the sample. No 3D
promise, no shipping regions, no fixed shipment window ("days may vary order to order").

**Guard:** `apps/cms/e2e/composition.spec.ts` (LA-01) pins №01–№07;
`apps/cms/src/lib/orderProcess.test.ts` refuses an unconfirmed promise.

**Amended 2026-10-02 (owner's choice, visual audit VA-29 with VA-34): one photo for every step,
and no factory strip.** №04 gives each of its eight steps its own photo, all cut to one square,
the words on the left and the photo on the right (above the words on a phone). The four phases,
the You / We markers and the drawn line stay. Every room the "Inside the factory" strip showed
was then pictured above it, so the strip (№06) and its lightbox were removed and "Talk to us"
became №06: the order is now №01–№06, and each of the ten photos is on the page once (№01 the
building and its roof, №04 the other eight). Steps 2 and 8 have no photo of their own subject, so
the testing lab and the tagging table stand in; the owner chose them. LA-01 now pins №01–№06.
**Guard:** `apps/cms/src/orderTimelinePhotos.test.ts` and `apps/cms/e2e/orderTimeline.spec.ts`.

**Amended 2026-10-05 (polish D4, the owner's answers Q14 and Q41 of 2026-10-03): stacking photo
cards, and one set of steps.** №04's eight steps are photo cards that stack as the page scrolls
(style B of the two the report showed): each step's own photo behind its words under the photo
hero's wash, with the stage and "You" or "We" on every card. The drawn line, the phase sub-lists
and the square frames went with the timeline. From 900px the heading stays beside the cards. The
order guide draws the same cards from `orderProcess.ts`, in place of the eight it had typed with
slightly different names (X21: the home page, the guide and the buyer pages had told the order
three ways; the buyer pages' own list went with polish S4). With motion allowed the cards stop
8px apart and the covered one sinks and darkens on a scroll timeline; Firefox stacks them without
the sink, and reduced motion, short screens and paper get a plain list. **Guard:** the same two
files, rewritten for the cards (`orderTimeline.spec.ts` runs in three engines).

**Amended 2026-10-16 (D40): №06 "Talk to us" merged into №05, so the home page runs hero →
№01 … №05 and ends on the works and their one ask.** **Guard:** the same LA-01 test, now №01–№05.

### D24 · The home page's garment turns in real 3D — reverses the 2026-09-07 still

**Decision: live 3D on scroll. Owner, 2026-09-29.** The owner asked for "more innovative and
creative ways to showcase that our products are truly 3D" and chose, of three options, the
model loading as the section nears the screen, turning slowly, draggable.

What made the still right on 2026-09-07 is kept as guards rather than discarded: nothing is
downloaded on the first screen (the model loads only within a screen of view); a data-saving
or 2G connection gets a "Turn it in 3D" button instead of a download; and the poster is still
what the server sends, so no JavaScript, no WebGL or a failed model leaves exactly the page of
2026-09-07.

⚠️ **It renders with the viewer's own print fixes, by exact copy.** The adaptive near plane
and the decal depth bias live in the viewer; an app may not import another's code, and moving
them to `packages/shared` would have dropped the viewer below its 58% coverage floor (58.68%
measured). `apps/cms/src/lib/render/viewerParity.test.ts` fails if either copy differs from
the viewer's file by one character, or if the lighting drifts.

**Guard:** `apps/cms/e2e/liveGarment.spec.ts` (a failed model keeps the picture; nothing loads
before the section is near; nothing loads on a data-saving connection until asked).

**Amended by polish D2 (2026-10-05): the section is a showcase.** The garment's column was 22rem
beside two lines and a button ("short words, tall picture", the polish report's D2). Now the
garment takes half the row, never wider than 64% of the screen's height, so its 4:5 frame fits a
laptop's screen; beside it, level with it, the words gain three points (turn it, zoom into the
print on its 3D page, share a colour's own link) and colour dots. A dot switches the live model to
that colour's variant inside the one GLB, the still under it, and the link, so a click lands on the
colour on show (`ProofShowcase.tsx`). New words for the owner's end-of-build approval.
**Guard:** `apps/cms/e2e/proofShowcase.spec.ts` (the size at four screens, the halves level, the
points, the dots without WebGL, axe in both themes) and `liveGarment.spec.ts` (a dot switches the
real model's variant).

### D25 · The footer shows the certification bodies' real logos — amends the 2026-09-16 ruling

**Decision: the footer draws the logos of the bodies its "Standards" entries name, in ONE row
of small marks under the facts, each body once; every entry keeps its text line. Owner,
2026-09-29**, after being told the marks' usage rules: GOTS, OEKO-TEX and Textile
Exchange each reserve the right to act on misuse of their marks; SMETA is an audit method, not
a certificate. That is why the heading stays "Standards" and every entry keeps its qualifier
text ("Parent: …", "Suppliers: …") — the picture says which body, the words say who holds it.

The artwork is the owner's own vector files, converted to plain SVG paths and trimmed to the
mark (`apps/cms/public/standards/`, 3.7–22.6 KB each; `packages/shared/src/standardsLogos.ts`
records each one's source file — in the shared package since 2026-10-02, when the garment pages
took the same footer, VA-31). Six marks, and only these:

- **Parent (DURUS INDUSTRIES):** Sedex, SMETA.
- **Suppliers:** ISO 9001, OEKO-TEX STANDARD 100, GOTS, GRS. amfori BSCI stays in the text only.
  (ISO 9001 was first recorded as the parent's; the owner corrected it the same evening and
  chose to keep the badge.)

**One row, not marks under each entry (owner, the same evening).** The first build drew each
entry's marks under its line; with the production entries that grew the footer slab from one
screen (900 px) to 1,173 px at 768 px wide, and centred the first two entries. One row of
28 px marks adds a single line.

Three of the owner's choices are rulings, not oversights:

- **ISO 9001 only.** The owner's file is a combined badge (9001 beside 22000); the 22000 half
  is not in the repository, and "ISO 22000" in an entry draws nothing.
- **SECP is text only.** It is a regulator, and its emblem beside a supplier list would read as
  an endorsement.
- **amfori BSCI is text only for now.** The only file on hand was the older mark (before the
  body became amfori), reading "Business Social Compliance Initiative" beside text that says
  "amfori BSCI"; the logo returns when the owner sends a current amfori file.

The folder holds other marks (ISO 22000, Made in Green, RCS/OCS, sgi). The company does not
claim them and none has a record. An entry that names no body draws no picture, and a word that
merely contains a body's name ("GRSX") does not count.

⚠️ **The chip is paper in BOTH themes.** The footer slab is ink in light mode and `--raised` in
dark, so the dark-on-transparent marks need a paper chip in each, not only in dark mode.

**Guard:** `apps/cms/src/lib/standardsLogos.test.ts` (whole words, order, no duplicates, no
22000, no SECP, no BSCI, each body once across entries, every file present at its recorded
size) and `SiteFooter.test.ts` (text kept, one row of marks after the blocks, images lazy with
a reserved size, no picture for an entry naming no body).

### D26 · One slower "showpiece" speed for three motions — amends D8

**Decision: `--showpiece: 1400ms` in `packages/ui/src/tokens.css`, used ONLY by the №05
count-up, the order timeline's draw and the contact globe's arcs. Owner, 2026-09-29.** D8 allowed
the existing tokens only, and the slowest, `--slow`, is a UI transition: a figure rolling to
100,000 or a line drawing down four phases at that speed reads as a flicker, not a flourish.
One named duration keeps the three in step and keeps "no new durations" true everywhere else.

What D8 guarded is unchanged: every one of the three is off under
`prefers-reduced-motion: reduce` (the final figure, the full line and a still globe are what
the server sends), and none animates text opacity.

**Guard:** `apps/viewer/src/styles/tokens.test.ts` (the token is documented in `docs/DESIGN.md`)
and `apps/cms/e2e/motion.spec.ts` (reduced motion shows the final state at once, with a
negative control).

**Amended 2026-10-05 (polish D4):** the order timeline's drawn line went with the timeline (D23's
amendment of that date), so two motions use `--showpiece`: the count-up and the globe's arcs.

**Amended 2026-10-16 (D40):** a third use, the №05 map pin's breathing ring, a loop like the 3D
button's glow (base.css `.btn--action-glow`), by scale and fade alone and off under reduced motion
(`e2e/worksSlab.spec.ts`).

## 2026-10-04 — the polish audit: one page per job

### D27 · A family has one list: its own page — amends D1 and D17

**Decision: the four buyer pages are the ONLY lists of their families' garments. `/products` shows
every garment under its family's heading, which opens that page; the old filter addresses
(`/products?family=…`) forward to it permanently; and the buyer pages stop copying the home page.
Owner, 2026-10-04 (Q24, Q25, Q26, Q28); built 2026-10-05.**

A family's garments were listed twice — on its buyer page and on its filtered gallery — and the two
pages linked to each other (visual audit VA-33). Two addresses for one list compete with each other
in search (Google, "Consolidate duplicate URLs", 10 July 2026), and a buyer could not tell which
was the family's page. The buyer pages keep their addresses, which Google already shows.

- **D1's reason holds.** Every garment is still in `/products`' HTML, grouped by family, so a
  crawler sees the whole catalogue at one URL and the page works with scripting off. The filter
  chips became a jump bar: plain links to the groups on the same page (Q28).
- **D17 now reads:** a family with no garments keeps its chip, dashed, with its count of 0, and its
  group on the page says so in its own words. Sports Accessories, which has no page, shows
  "[ soon ]" and "Ask what we make →" to Contact (Q21), and so does its home-page card, which
  opens Contact (polish F8, 2026-10-05). Both say it only while the family has neither a page nor
  a garment.
- **The old addresses forward** with Next's permanent redirect (308, which Google treats as a 301,
  "Redirects and Google Search", updated 14 April 2026): a family with a page to the page, Sports
  Accessories to its group, anything else to `/products`.
- **The buyer pages copy nothing:** no numbers, no factory photos, and none of their own five order
  steps (the third telling of the order process, audit X21). They link the order guide instead.
- **Everything that linked a family links its one list:** the home page's family cards (but the
  "[ soon ]" one, above), the footer's "What we make", the garment pages' trail and their "See all
  … in 3D", and `/llms.txt`.

**Guard:** `apps/cms/src/oneListPerFamily.test.ts` (every family link and forward, no `?family=`
link anywhere in the site's source with a planted-link control, no copied section on a buyer page)
and `apps/cms/e2e/oneListPerFamily.spec.ts` (each old address answers 308 to the right place, each
heading opens its family's page, every garment is in the page with scripting off, a chip lands its
group below the bar).

## 2026-10-05 — the polish build: a motion, and the colour names

### D28 · A product card's picture grows into the garment page — polish MO3

**Decision: tapping a product card grows its picture from the card to the whole screen while the
garment page's loading screen fades in over it. Owner's choice, 2026-10-05: "grow into the loading
screen".** The garment page always opens on that full-screen loading screen (`apps/viewer/index.html`,
RO-08), so the 3D window is not there yet to grow into; the loading screen then wipes away to the
garment as it always has.

It is a cross-document view transition, which has costs worth knowing before anyone touches it:

- **Both pages opt in, under `prefers-reduced-motion: no-preference`, and the opt-in covers every
  navigation.** So the website names ONLY the tapped card's picture (`CardOpening.tsx`) and skips the
  transition for every other link, and the garment page skips it on every link out
  (`apps/viewer/src/lib/pageTransition.ts`). Any other link just loads the next page, as before.
- **The garment page's opt-in is inline in `index.html`.** From `page.css` Chromium turned every
  arrival down (0 of 3, measured 2026-10-05); inline it paired the card's picture with the loading
  screen 3 of 3. Its note there is one line: a 1,066-byte note moved the slow-3G first paint from
  2,280 ms to 2,420 ms (median of 5) against `e2e/firstPaint.spec.ts`'s 2,400 ms ceiling, while the
  opt-in itself cost nothing.
- **Two elements with one name cancel the whole transition**, so the name `garment-opening` is
  never written in the website's stylesheet.

**Fallbacks:** reduced motion gets no transition at all; Firefox has no cross-document transitions
yet (5 Oct 2026) and simply loads the page, as it did before. Chrome, Edge and Safari 18.2+ get it.

**Guard:** `apps/cms/src/lib/cardOpening.test.ts` (both pages opt in under the reduced-motion guard,
one shared name, none in the website's stylesheet), `apps/cms/e2e/motion.spec.ts` (a card tap lets
the transition go, any other link cancels it, reduced motion offers none) and
`apps/viewer/e2e/page-transition.spec.ts` (the card's picture pairs with the loading screen, leaving
a garment page stays instant). The first two record a negative control run both ways. The motion is
described in `docs/DESIGN.md`, section 5.

### D29 · The live colours are renamed in their category's style; the addresses stay — polish N1, N2

**Decision: the 200 colourways on the 40 published garments were given new display names, in the
style the owner chose for each category. Owner's answer Q38; the owner approved all 200 new names
on 5 Oct 2026.** Q38 set each category's style: sport words for Teamwear, performance words for
Sportswear, nature words for Outerwear and easy fashion words for Casual Wear
(`packages/shared/src/colourNames.ts`; `.claude/rules/products-and-colours.md`).

- **Written to the live CMS on 5 Oct 2026**, as display names on the 40 published garments (200
  colourways), each read back after the write. A nightly-backup run was taken first.
- **No address changed and no row was reordered.** Every colourway slug (the web-address word
  printed on QR tags) is unchanged, and so is the row order that decides the default colourway.
- **The hidden photo descriptions (`altText`, "<garment> in <colour>") were updated to the new
  names, at the owner's choice.**
- **A new garment arrives named in its category's style** (polish N2), from the same table, so it
  stays in step with the live ones.
- **Renamed again the same evening, so every name says its colour.** The owner: "the current names
  do not give a hint of what the garment is". Owner's choice: a themed word plus a colour word
  ("Pennant" became "Claret Red", "Varsity" "Varsity Navy"), keeping each category's own style
  and every name that already paints its colour ("Ice Rink", "Tennis Ball", "Strawberry"). The
  owner approved the whole second list on 5 Oct 2026: 103 of the table's 216 names changed, and 127
  of the 200 live colourways. Written the same way as the first, after a fresh backup run, each
  garment read back; still no slug sent and no row moved.

**Guard:** `packages/shared/src/colourNames.test.ts` (a name is unique inside its category, at most
12 characters, never a plain word such as "Pink") and `tools/asset-pipeline/src/colour-name.test.ts`
(fails if the namer gains a colour the table has no name for).

## 2026-10-07 — the company pages: policies, careers and community

### D30 · Policies, careers and community are pages in code, every word approved by the owner

**Decision: a policies hub at `/policies` with seven policy pages, plus `/careers` and
`/community`, written in code (not the CMS). The words were drafted from the owner's answers and
the owner approved every page on 7 Oct 2026, with changes.** Only the Journal (a later phase) goes
in the CMS; pages that state the company's commitments change rarely and are reviewed like code.

- **Addresses use the guides' "-and-" style**, so the vaccine page is
  `/policies/health-and-vaccination`. The words live in `apps/cms/src/lib/policies.ts` and
  `apps/cms/src/lib/companyPages.ts`.
- **The anti-harassment policy is held back on purpose**, until the complaints committee it
  describes exists (owner, 7 Oct 2026). It is absent from the hub, the sitemap and the footer, not
  a page saying "coming soon".
- **The careers page's words never type an email address.** Its "Write to us at" line names
  the applications inbox from one constant in code since Phase 2 (D32).
- **The company's structured data names its parent company** (`parentOrganization`), and still
  carries no `Product` schema (`apps/cms/src/lib/structuredData.ts` says why).
- **No new header-menu items**; the header stays as the owner approved it. The footer carries the
  new pages (D31).

**Guard:** `apps/cms/src/lib/siteFacts.test.ts` refuses the claims the owner has ruled out in any
new page's words; `policies.test.ts`, `companyPages.test.ts` and `apps/cms/src/newPagesWiring.test.ts`
fail when a page is missing from any list a public page must be in (the RUNBOOK section "The
company pages, FAQ and glossary").

### D31 · The footer gains a "Company" group; its layout was approved with the real footer facts

**Decision: a "Company" group (Careers, Community, Policies) after "What we make", on the website
and on the garment pages alike. The owner approved it on 7 Oct 2026, twice: first from pictures
drawn without the footer's facts, then — after a browser test showed the difference — from pictures
drawn with the real ones.** With all six groups filled, Standards takes a second row on a wide
screen and Elsewhere (LinkedIn, Instagram) starts its own row on a phone, where What we make and
Company share a row. The owner chose that layout over squeezing six columns into one row.

- **Live links only.** Press joins the group, and a "Learn" group arrives, only when those pages
  exist (later phases), so the footer never links to a missing page. Done 7 Oct 2026 (D34).
- **Not on paper.** Printed, the group's three lines pushed the fullest garment onto a second A4
  sheet, so the owner chose to leave it off paper (7 Oct 2026) and keep polish F14's one-sheet
  garment page. That print-only rule in `packages/ui/src/footer.css` is the group's only new style:
  the garment pages' stylesheets grew 9 bytes gzipped (13,777 to 13,786, measured 7 Oct 2026),
  within the bundle budget. Lighthouse's budget reads the TRANSFER size instead (headers
  included, uncompressed CSS): CI measured 62,613 B against 62,610, +23 B raw, so the owner chose
  to raise it by exactly that (62,610 to 62,633; `lighthouserc.json` has the dated entry, PR #141).
- **The standards logos stay exactly as they are.**

**Guard:** both footers are held to `siteFooterAriaSnapshot` (`packages/shared/src/siteFooter.ts`);
`apps/viewer/e2e/siteFooter.spec.ts` holds the phone layout with the real footer facts, and
`apps/viewer/e2e/print.spec.ts` the one printed sheet.

### D32 · Job applications go to hr@wear-run.com, fixed in code, and are kept 12 months

**Decision: the careers page carries an application form. Applications go to
hr@wear-run.com, an address fixed in code rather than a CMS setting, and the page's "Write to
us at" line names the same inbox. The owner chose both on 7 Oct 2026.** The fields (name, phone
and role required; email, years, a note and one CV optional), the "Send application" button,
the 12-month keep and the privacy notice's "Job applications" section were approved on the same
day, word for word.

- **One constant, two uses.** The form's recipient and the page's line both read
  `APPLICATIONS_TO` (`apps/cms/src/lib/application.ts`), so they can never disagree. Changing
  the inbox is a code change and a deploy, which the owner preferred to a setting someone
  could change by mistake.
- **Built like the contact form, kept apart from it.** Stored first and emailed second; a
  private bucket prefix for CVs (`careers`) with no public address; its own rate counters, so
  a burst of applications cannot block buyers' inquiries.
- **Twelve months, then the owner deletes.** The "Delete after" date is set once when an
  application arrives. No robot deletes applications; the owner does it monthly from the
  admin (RUNBOOK, "Job applications from the careers form").
- **No job listings and no `JobPosting` data**, as the plan for these pages set: the page
  takes applications; it does not advertise vacancies.

**Guard:** `apps/cms/e2e/careersForm.spec.ts` sends applications with and without a CV in
three browsers, refuses a renamed program, and checks that a stranger gets 403 for the
applications and their CVs; `apps/cms/e2e/privacyClaims.spec.ts` holds the notice's words.

### D33 · The privacy notice tells the people we email first, and claims nothing unconfirmed

**Decision: `/privacy` gains "When we write to you first" (`#outreach`), after "When you contact
us", in the owner's words, approved from a preview on 7 Oct 2026. Data requests go to
privacy@wear-run.com; partner@ stays the buyers' address.**

- **The right to object stands alone**, in its own paragraph and box, as the ICO's "What
  privacy information should we provide?" asks ("clearly and separately"; read 7 Oct 2026).
- **No safeguard is named for the transfers outside the UK and EU.** The same ICO page asks for
  one, or for a statement that there is none; the owner was told and chose to say nothing beyond
  the approved sentence, as no safeguard, certificate or contract is confirmed in writing.
- **No "no tracking" line.** The owner could not confirm that open and click tracking is off,
  so the sentence was left out, and on 7 Oct 2026 chose not to check it further.
- The box is a hairline on all four sides: `vibecodedRules.test.ts` (VC-07) refuses a thick
  coloured stripe down one side.

**Guard:** `apps/cms/e2e/privacy.spec.ts` checks the section's place inside the notice, its
"On this page" link and jump, the objection paragraph word for word, and the privacy@ link
under "Your rights".

**Amended by D37 (2026-10-11):** the buyers' address is inquiry@, not partner@; data requests
still go to privacy@.

### D34 · The Learn pages, the hubs and the press page

**Decision: the FAQ (with "Working with us"), the glossary, the Journal, case studies and a
press page ship together, every word approved by the owner on 7 Oct 2026.** Amends D31's "later
phases" bullet: Learn (Guides, FAQ, Glossary, Journal) and Company (Careers, Community,
Policies, Case studies, Press) are now complete.

- **Both hubs show from day one.** `/journal` and `/case-studies` are indexable and listed in the
  sitemap and `/llms.txt` before anything is published (the owner's choice); an empty Journal
  shows its five topics, and nothing reads "coming soon" (`JournalIndex.tsx`).
- **The FAQ quotes the owner, not an estimate.** Numbers in an answer come from the site's facts
  or `OWNER_FIGURES` (`apps/cms/src/lib/faqs.ts`); the under-50 answer stands beside the
  50-piece minimum, as the owner wrote it.
- **The press page names no founding year and no person.** The family year is read from the
  lineage line; every factory photo may be downloaded with the credit "RUN APPAREL", because the
  owner confirmed the people in them agreed to press use; journalists write to media@.
- **Every footer group link is 44px wide as well as tall**, as the legal links are: "FAQ" was
  21.6px. The garment pages' stylesheet grew 28 bytes, and the owner chose to raise its Lighthouse
  limit by exactly that (62,633 to 62,661; `lighthouserc.json` has the dated entry).

**Guard:** `faqs.test.ts`, `glossary.test.ts`, `press.test.ts` and `companyPages.test.ts`;
`apps/cms/e2e/pages.spec.ts` and `legibility.spec.ts` load every page.

**Amended by D37 (2026-10-11):** journalists write to press@, not media@.

### D35 · The website's CSS is one cached file again — reverses RO-08's inlined CSS

**Decision: `experimental.inlineCss` is off (7 Oct 2026, delegated by the owner to "the latest
best practices" after a live incident), and CI measures the CMS Worker's size before every
merge.**

- **The incident.** The pages PR (D34) took the CMS Worker to 64,905 KiB, 99% of Cloudflare's
  64 MiB limit (developers.cloudflare.com/workers/platform/limits, read 7 Oct 2026). One request at
  a time the site served; a burst of 16 or more simultaneous requests got Error 1101 for
  everything past the first ~10, because a fresh copy of the Worker failed to load. No Worker
  recorded an error (GraphQL analytics and a live tail both showed only successes), and the same
  probe had passed that morning on the 52,301 KiB version.
- **The cause.** With inline CSS, Next writes the whole minified stylesheet (124 KB) into every
  route's `page_client-reference-manifest.js`, four times, and the Worker bundles all 51 of them:
  22 MB. Each new page cost 0.5 MB and each 1 KB of CSS about 200 KB. Off, the Worker measured
  42,994 KiB and a manifest 14.6 KB.
- **Why off rather than fewer pages.** Next's page on the option (v16.4.0, updated 2026-03-03)
  calls it experimental and "not recommended for production", and says to skip it for "large CSS
  bundles" and "many pages sharing styles". Merging pages into templates would still have left
  the Worker near the limit and every new style multiplying.
- **What a visitor pays, measured.** On slow 3G the first paint waits for one stylesheet download
  again: 3.4-3.5 s on the local harness (1.1 s inline), past RO-08's 3 s target, because the sheet
  grew to 127 KB raw (22 KB gzip) while inlining hid it. On 4G or Wi-Fi the difference is tens of
  milliseconds, and every later page reads the sheet from the cache. `e2e/firstPaint.spec.ts`
  holds one shared, hashed sheet and today's number (4.1 s ceiling); a smaller stylesheet is
  what brings RO-08 back.

**Guard:** `scripts/check-cms-worker-size.mjs` in `verify` fails over 80% of the limit
(`apps/cms/src/cmsWorkerSize.test.ts`, with the incident's bundle as its negative control).

### D36 · The about and factory pages, moving with the scroll in the site's own motion system

**Decision: `/about` and `/inside-the-factory` are code pages like careers and press, every word
approved by the owner on 2026-10-09, and their motion is this site's own — scroll-driven CSS behind
the existing guards, no animation library.**

- **The pages.** Words in `apps/cms/src/lib/aboutPages.ts`, registered through `COMPANY_PATHS`;
  `/factory` forwards to `/inside-the-factory`, exact path only (the photos live under `/factory/`).
  The footer's Company group gains About and Inside the factory, in two short columns from 1280px
  so the slab stays one screen (owner's choice from pictures of the real footer, 2026-10-09; the
  garment pages' stylesheet budget rose 112 B for it, `lighthouserc.json`).
- **The floor area is 193,000 sq m, not sq ft** (owner, 2026-10-09): `FACTS`, the press page and
  `/llms.txt` say so.
- **Motion, under D8.** Every effect sits inside `prefers-reduced-motion: no-preference` and
  `@supports` for scroll timelines WITH ranges, as `card-rise` does; the larger layouts also need a
  screen at least 700px tall. Text moves by `translate` only; opacity changes only on pictures.
  Two additions to D8's rules: **movement that only tracks the scroll is `linear`** (the hero's
  card, the timeline's track, the word rows, the drifts) — an ease-out on a scroll timeline
  front-loads the travel, and the hero's words were 560px gone a tenth of the way in; and **the
  preloader's counter is the second use of `--showpiece`**, after the count-up it copies.
- **base-ui joins `apps/cms`** at the viewer's exact version (1.8.0) for the factory gallery's photo
  viewer, the use `docs/DECISION-UI-LIBRARIES.md` reserves it for. It keeps base-ui's own page lock
  rather than adding `holdPage`, because the smooth scroll already reads that lock and a second one
  can leave the page held.
- **The mission quote.** /about's mission sentence stays word for word, in `[data-quote]`, which
  the readability test and the buzzword check skip (owner, 2026-10-09). The readability test also
  reads a list item that holds paragraphs through those paragraphs, once (owner, same day): it had
  counted the factory's stages twice, once as a run-on line with no full stop.
- **The preloader stores nothing** (owner, 2026-10-09). It shows only to a visitor arriving from
  outside the site, so it needs no memory of having shown, and a plain visit still keeps nothing on
  the device (`apps/cms/e2e/headers.spec.ts`). It is the first thing cut if a speed check fails.
- **The byline sits under the opening paragraph** on /about, as on the guides, policies and careers.
- **Their styles are a sheet of their own** (`apps/cms/src/app/(frontend)/about-factory.css`, owner,
  2026-10-09), imported by the two pages only. Added to `site.css` they took the built sheet from
  127 KB to 143 KB minified, and Turbopack's default CSS chunking (Next 16.3.8) split it into two
  files on every page, against D35; `turbopackChunking.maxMergeChunkSize` did not bring it back and
  the `graph` strategy is newer than 16.3.8. Every other page keeps D35's one file, the size it was.

**Guards:** `apps/cms/e2e/aboutFactory.spec.ts` (in WebKit's file list as well as Chromium's and
Firefox's), `apps/cms/src/lib/preloader.test.ts`, `apps/cms/src/lib/photoViewer.test.ts`,
`apps/cms/src/hostRulesManifest.test.ts`.

## 2026-10-11 — the addresses the site shows

### D37 · Every address the site shows is an alias of team@ — amends D13, D33 and D34

**Decision: the website shows only aliases of team@wear-run.com, so mail that came from the site
is told apart from the rest. Buyers write to inquiry@wear-run.com, and the contact form's
messages arrive there too; journalists write to press@; data requests still go to privacy@ (D33)
and applications to hr@ (D32); security reports go to security@. partner@ is shown nowhere. The
owner chose each one on 11 Oct 2026.**

- **inquiry@ is the Site Settings email**, still one CMS box (Settings → Email): the footer on
  every page, the contact page, the "Email" buttons, the garment pages, Google's company data,
  and where the form's notifications go. The code default
  (`packages/shared/src/defaults.ts`) shows on the error and 404 pages and whenever the CMS
  cannot be read. The contact page keeps its "[ Partnerships ]" label (owner).
- **The saved box moves with the deploy**, by a guarded UPDATE
  (`apps/cms/src/migrations/20261011_120000_site_email_inquiry.ts`), as the footer tab's name
  did on 5 Oct: partner@ becomes inquiry@, and an address typed in the admin is left alone. The
  owner chose this over editing the admin after the deploy, so no page shows partner@ in between.
  The form's notification goes to exactly the address the site shows (`inquiryRecipient` reads
  it through `mergeSiteSettings`).
- **press@, not media@,** on the press page (`PRESS_EMAIL` in `apps/cms/src/lib/press.ts`).
  media@ still arrives, but no page shows it.
- **security@ in security.txt** on every host (`packages/shared/src/securityTxt.ts`): RFC 9116
  §2.5.3 points to RFC 2142's SECURITY mailbox. SECURITY.md names it too.
- **The GitHub pages changed as well** (owner's choice): the licence's "Enquiries" line and its
  picture say inquiry@; README, CONTRIBUTING, SUPPORT, the code of conduct and the "When
  something looks wrong" guide say info@, with SUPPORT's security route on security@; the
  outreach template's signature (`docs/BUYER-JOURNEY-PROTOCOL.md`) says inquiry@.
- **Left as they are, on purpose:** the addresses the form emails are sent FROM
  (`inquiries@` and `noreply@wear-run.help`, never shown to a visitor; a new sending domain
  needs its own DNS records), the CMS logins, the D1 column's own SQL default (still partner@,
  because changing a column default rebuilds the table), and dated records of what was true
  before.

**Guards:** `apps/cms/src/globals/SiteSettings.test.ts` holds the CMS defaults to
`DEFAULT_SITE_SETTINGS`; `apps/cms/src/migrationReplay/siteEmailInquiry.test.ts` holds the
guarded UPDATE; `apps/cms/src/lib/inquiry.test.ts` pins where the form's notification goes;
`packages/shared/src/securityTxt.test.ts`,
`apps/cms/src/lib/press.test.ts`, `apps/cms/e2e/press.spec.ts` and
`apps/cms/e2e/privacy.spec.ts` hold the other addresses.

## 2026-10-11, later — what the garment pages tell search engines

### D38 · Garment pages carry no product label for search engines — amends D10

**Decision: a garment page no longer labels itself a schema.org `ProductGroup` or `Product` with
an `Offer`. Its breadcrumbs, words, title, description and picture stay. D10's first sentence
stands: no price, ever. Owner, 2026-10-11 (question tool), after Search Console's "Merchant
listings" and "Product snippets" emails.**

D10's made-to-order offer was a true statement that Google cannot read:

- **Both rich results need a price, a review or a rating, and these pages have none.** Product
  snippets need a review, an aggregate rating or an offer with a price. Merchant listings are
  "Only pages where a shopper can purchase a product", with a price above zero. `MadeToOrder` is
  on neither list of availability values. (Google Search Central, product-snippet page updated
  2026-09-08 and merchant-listing page, both read 2026-10-11.)
- **So the label earned nothing and reported errors on every garment.** URL inspection of
  `/products/rxps/wine` (crawled 2026-09-30) showed, for product snippets, ERROR "Either "price"
  or "priceSpecification.price" should be specified" plus four warnings, and for merchant
  listings, ERROR "Either "price" or "priceSpecification" should be specified" plus three
  warnings. Google's Rich Results Test on the live page on 11 Oct: 3 items, the product snippet
  and the merchant listing invalid, the breadcrumbs valid.
- **No penalty either way.** Google's page describes missing fields only as making a page
  ineligible for the rich result. RUNBOOK already called the warning expected. What changes is
  that Search Console stops reporting it, and the owner stops getting the emails.
- **Nothing a buyer or a reading machine needs goes.** The fabric, weight, fit and colours are in
  the page's words (`buildCrawlerBody`), which every robot gets. The one thing no robot-visible
  output carries any more is the link to the 3D model file, which the label held;
  `apps/viewer/public/llms.txt` already tells AI readers that file is a rendering input, not a
  document. Lighthouse's agentic-browsing audits read no product markup (Lighthouse 13.5.0's
  default config).

**Guard:** `apps/viewer/worker/preview.test.ts` → "no product label for crawlers (D38)". It
requires that a garment page carry breadcrumbs at most, never a Product, ProductGroup or Offer,
and that no `price` key reach the structured data (D10). It failed on the old block. The
breadcrumb block now carries the escaping test the product block had, proven with a planted
fault. It also reads `apps/viewer/worker/index.ts` and `apps/viewer/index.html`: the Worker
appends one block, the breadcrumbs, and the static page carries none, so a block typed into
either fails it too (the Worker file from before D38 does). `apps/viewer/src/llmsTxt.test.ts`
holds llms.txt to the same list; the branch's review found it still describing the label.

## 2026-10-15 — what the works are

### D39 · Six buildings on one site, never "one building"

**Decision: the works are six buildings on one site, with 193,000 sq m under roof (the floor
area, not the land). No page says "one building", "under one roof", "the same floor" or "our
building". Owner, 2026-10-15 (question tool), with every new line approved word for word.**

Until that day the home page's №01 printed "ONE — Building, first stitch to sealed bag" beside an
aerial photo that shows the other buildings, and the same claim sat in the FAQ, the guides, the
order steps and the company pages. The new words say "on one site" or "on the same site" where a
sentence was about the work happening in one place, and "our works" where it only named the
place; the two lines beside a building photo say "our buildings", because those words must name
their photo (polish X22, C-8). The order steps still say "Pakistan", not "Sialkot" (the owner's
rule of 2026-09-29, kept). "The same building from above", the solar photo's description, stays:
it is the building in the photo before it. "200 people at the works" counts everyone on the site.

**Guard:** `apps/cms/src/lib/siteFacts.test.ts` → "six buildings on one site", which reads every
copy module and the home page's source, with a planted-line control run both ways.

### D40 · One closing section: №06 joins №05, and the home footer asks nothing — amends D23

**Decision: the home page ends on one section, №05 "The works": its five figures, its lede and its
dark slab (where we ship | certification) exactly as before, then one slim row under the slab that
holds the page's one closing ask. №06 "Talk to us" is gone into that row, and on the home page alone
the footer leaves out its question, tab and clock, as the garment pages' footer does. Owner,
2026-10-15/16.**

**Amended by D46 (2026-10-17):** the home page's footer has its question, tab and clock again; the
row under the slab stays.

The owner's rule from 2026-10-15 is that a page says nothing twice. №06 repeated №04's step 01 ("a
sketch is enough", "we reply within 24 hours") and the footer's contact block (its email and
WhatsApp buttons), and the footer's question asked a third time a screen later. A first build put
the ask in the slab's certification half and cut №05 to four figures; the owner kept the
certification half, the five figures and the full lede instead (2026-10-16: "I did like the
previous"), and chose a row under the slab for the ask. The row is №06's heading, the works' live
clock under it, "Start a conversation" (the hero's name for the same button: polish X20, and WCAG
3.2.4 holds within a page, so action names are the one thing the no-repeat rule lets repeat; owner,
2026-10-16) and "Or book a call" to the owner's booking page. It has no line of its own, because
the lede above already says "ask and we will put it in writing". The map's pin breathes (D26's
amendment).

**Guard:** `apps/cms/src/components/site/FactsBento.test.ts` and `SiteFooter.test.ts` (the row
under the slab, and the home footer's shape, each with a control run both ways), and
`apps/cms/e2e/worksSlab.spec.ts` and `footer.spec.ts` in all three browsers.

### D41 · №01 stands on the roof photo, and says the year once

**Decision: №01 "Who we are" sets its words and figures on the aerial photo of the works' solar
roof, under a dark wash: the words on the left, four figures on the right (1889, six buildings,
193,000 sq m under roof, about 80% of the electricity from the solar roof). The heading ends "for
generations." and №01's lineage sentence drops its year; the hero and the first figure say 1889.
Owner, 2026-10-15 (option C), words and figures 2026-10-16, built section approved as shown.**

The front of the building, which stood beside the roof photo, left the home page (the "Inside the
factory" gallery keeps it). The shared lineage sentence keeps its year, because the press page
reads 1889 out of it and the careers and community pages quote it whole; №01 has its own,
"…without a break since it began". 193,000 is also one of №05's figures: the owner chose to show it
in both, after being told it would repeat. The floor area and the solar share count up; the year
and "Six" do not. "Our story →" stays. The figures are off-white, not the lime of C's picture: X25
keeps lime for the big title, the buttons, the accent words and №05's featured figure, and the
owner chose off-white after seeing both side by side (2026-10-16). The accent "for generations." is
lime in both themes, as the hero's title is, because the section is dark in both.

The wash is 90% ink across the words' half and 70% at the right edge, where C's picture had 35%:
small text needs 4.5:1 over the brightest pixel a photo can put under it, and at 35% the labels
would be 1.80:1 over white. The section number keeps the site's muted grey, which nothing may
restyle, so the ground under it is darker instead (88% on a phone). The section borrows the photo
hero's dark token set, and its print rule.

**Guard:** `apps/cms/src/lib/aboutCopy.test.ts` and `apps/cms/src/components/site/AboutSection.test.ts`
(the words, the four figures and their order, one photo), and `apps/cms/e2e/aboutGround.spec.ts`,
which reads the wash back from the page and checks every word over white at three widths in both
themes, with C's 35% wash as its planted fault.

### D42 · №04 is four full-screen stage cards, two steps to a card — amends D23

**Decision: "How an order works" draws its eight steps as four cards, one per stage, each the
screen's full width and height. The stage is named once, in a pill ("Stage 1 · Talk"); each half of
a card is one step over the photo of the room it happens in, with its number and whose move it is
at the top and its title and two lines at the foot. The heading and its line sit in the page's
column above the cards. The order guide draws the same four cards. Owner, 2026-10-15 (option A3),
words 2026-10-15/16, built section approved as shown.**

**Amended by D46 (2026-10-17):** the cards stop under the condensed bar, reach the screen's foot,
rest a third of a screen each, and stack on every phone.

Until then eight half-width cards passed on the right while the heading stayed on the left (polish
D4). Each step gains a second, smaller line, and every one is a line the site already states
elsewhere (an FAQ answer, the factory page, the packaging guide), approved word for word; two keep
their source's hedge, "typically" and "no set minimum" (owner, 2026-10-16). Step 4 is "Approval".
Step 2 no longer gives the minimum, because the hero does and the page says nothing twice; bulk
production reads its lead time from `LEAD_TIME`. "Start with step 1", the button after the cards,
went (owner, 2026-10-16): the hero's "Start a conversation" and the ask under №05 lead to the same
form. The photos are the site's own, so on a sharp full screen a half asks up to 2,560 px of a
1,200–1,600 px file; the owner chose them knowing they would be soft there (no new originals).

The cards stop under one another as the page scrolls, with no animation, for someone who allows
motion and only on a screen tall enough for the fullest card: 40rem from 900px wide, 50rem below
it. Measured in the build, the fullest card needs 666px at 360px wide, 626px at 375–390px, 601px
at 768px and at most 408px from 900px; a 360x780 phone was 1px short under 48rem. Below the line,
and for reduced motion and print, the cards are a plain list. The step text keeps the steps'
50-character measure, the smaller line included (FA-C-52).

**Guard:** `apps/cms/src/orderTimelinePhotos.test.ts` (four stages, their numbering, eight photos
and the stack's guard), `apps/cms/src/lib/orderProcess.test.ts` (the words, `LEAD_TIME`, no
minimum), `apps/cms/src/factoryPhotos.test.ts` (which photos may fall short, and by how much), and
`apps/cms/e2e/orderTimeline.spec.ts` in all three browsers: every step's words inside its card at
nine screen sizes, the plain list on four short ones, and every line's contrast read from the
pixels behind it, with the washes removed as its planted fault.

### D43 · №03 shows the Capsule Core Hoodie, its colours as a growing pill, and its own details

**Decision: №03 "See it before it exists" shows the Capsule Core Hoodie (`r-cch`), not the first
garment in the gallery's order. Its colours are a row of round buttons, the chosen one a pill in its
own colour with its name. Under them, the hoodie's details read from its CMS record: its type, fabric,
weight, fit and what it is built with. The sentence ends "…on request, before a sample is cut.", two of
the three points stay ("Share a link" went), "3D" keeps its capitals in the heading, and the button is
"Browse in 3D" with the live count beside it ("41 garments"). Owner, 2026-10-15 (option A and the
hoodie), the button 2026-10-16.**

The first garment was the X-Milo Pro Bib, which №02's Teamwear card also shows. If the hoodie is ever
retired, the section falls back to the first garment with a poster rather than going empty. The pill
is measured once and moved by `translate`, with a `clip-path` showing only the dot until it is chosen:
3 layout passes a change on the options page, against 199 for a view transition. On a phone the order
is the words, the garment, its colours, its details and the button, so the colours come after the
garment they change. Three things the options page did not show, handled in the build: a long name
wraps inside its pill rather than running off a 360px phone; the keyboard ring is drawn inside the
pill, which its own clip would otherwise cut; and a mid-tone colour that neither ink can reach 4.5:1
on gets an ink pill with paper words (the hoodie's five all clear it, the closest at 4.75:1). On a
phone the dots are 36px wide, still 44px tall, as the gallery's phone dots are (owner, 2026-10-16),
because five 44px dots left a 360px phone's pill about 52px for "Black Cherry / Cranberry"; a long
name takes up to three lines in its pill. The
pills are a radio group (WAI-ARIA APG): Tab lands on the chosen colour, the arrows move and choose.

**Guard:** `apps/cms/src/lib/proofShowcase.test.ts` (the garment, the count's wording, each pill's
contrast with a mid grey as the planted fault) and `apps/cms/e2e/proofShowcase.spec.ts` (the order,
the radio group and its keys, a 27-character name at 360px held inside its pill, axe in both themes), with
`e2e/liveGarment.spec.ts` for the live model's colour.

### D44 · №02's cards open beside the picture, on another colour, with each family's list from the CMS — amends polish D3

**Decision: the five family cards keep one link each and open as before (a resting pointer or the
keyboard, now from 1440px where a pointer can hover; open all the time everywhere else), but an opened
card's words slide out beside its picture instead of the row being laid out again. The picture turns
to another colour of the same garment (the Sports Bra to blush, the Pro Bib to mint, the Active Zip to
teal, the Windbreaker to fuchsia), the line under it names the garment, and the colour's name sits
over the garment's colour dots. Each card shows its family's list: what Sportswear and Teamwear are
made for, what the other three have in the range, the first six and "+ N more". Owner, 2026-10-15
(option C2, its lists, and "nothing said twice").**

Until then an opened card widened and its neighbours' grid tracks moved, 599 layout passes an opening
on the options page against 2–4 now: every card keeps its box, the cards move by `transform` (each
already rises into place by `translate`), and the words' sheet is revealed by `clip-path`. The words
themselves are not clipped, because the title's link stretches over the whole card from inside them.
The card no longer gives the minimum (the hero does), and its second picture is silent to a screen
reader (the first already names the garment). The lists live in Site Settings, one array per family,
so they change without a release; the owner asked Claude to keep them up to date through the API. They
arrive by migration `20261016_150000_family_lists` (five new leaf tables, no rebuild) and are written
into the live CMS after the deploy, after a D1 backup. A phone and a tablet keep the sideways card,
with no dots; one column now up to 900px (it was 560), because a two-up card's words would be about
145px wide. The row begins at 1440px, not 1180 (owner, 2026-10-16): beside a 4:5 picture an opened
card's words were up to 79px too tall below that, so a laptop narrower than 1440px gets the tablet's
two-up open cards. The tickets' notches and tear line went with C2's picture.

**Guard:** `apps/cms/src/components/site/FamilyCard.test.ts` (one link, nothing said twice, six and
"+ N more", the dots), `apps/cms/src/lib/families.test.ts` (each family's list field exists in Site
Settings; the colour an opened card shows), `apps/cms/src/lib/projectPublic.test.ts` (the lists as
read), `apps/cms/src/migrationReplay/replay.test.ts`, and `apps/cms/e2e/familyTickets.spec.ts` in all
three browsers: an opening leaves every card's box alone, the words fit beside the picture at 1440
and 1920px, a 1280px laptop gets the two-up cards, no sideways scroll, the keyboard ring in pixels,
and axe in both themes.

## 2026-10-17 — the first-glance check

### D45 · The hero says "Family-run since 1889", and the way to the 3D garments is "See products in 3D" — amends polish X20 (Q40)

**Decision: the hero's label reads "[ Family-run since 1889 · Start from 50 pieces per style ]", and
the site's one name for the way to the 3D garments is "See products in 3D", everywhere "Browse in 3D"
was: the home hero and №03, the family pages, the FAQ, the glossary, the 404 and error pages, and the
3D viewer's error screen. Owner, 2026-10-17, choosing between options drawn on the live phone screen.**

The owner did not want a team test, so five helper agents each answered the six approved questions about
the phone first screen: Haiku at low and medium thinking, Sonnet at high, extra-high and maximum. Every
helper said its context already described the company; the owner chose to go on with that marked. All
four scored questions passed at 5 of 5. Two things were named by four of the five: "since 1889" read
oddly, and what "Browse in 3D" would show was unclear.

The label had said "Private label manufacturer since 1889", which reads as the company itself being
that old. The site's own records put 1889 on the family: `LINEAGE` ("company names have changed over
that time"), `llmsTxt.ts`, and `structuredData.ts`, which leaves out a founding date for that reason. The
old label also repeated "private label … manufacturer" from the sentence under it. "Family-run" is the
owner's statement that the family runs the business today.

The button follows "a link is a promise" (NN/g, "'Get Started' Stops Users", 2017, read 2026-10-17):
the page it opens is headed "3D product references", and the menu already names it "Products". The
name is still one name everywhere, which is X20's rule; only the wording of Q40 changed, so "Browse in
3D" joins the retired names. "See garments in 3D" was the other option; it would have sat directly
above №03's live count "41 garments" on a phone.

**Guard:** `apps/cms/src/components/site/HomeHero.test.ts` (the label's words), `apps/cms/e2e/copy.spec.ts`
(one name for the way to the 3D garments on every page, "Browse in 3D" among the retired names),
`apps/cms/e2e/composition.spec.ts` (the label's two lines on a phone, one line from 40rem), and
`apps/cms/e2e/proofShowcase.spec.ts` and `findability.spec.ts` for the two home buttons.

### D46 · The home page audit's answers: the full footer again, №04 fills the screen and stacks on every phone, №03 zooms after a click — amends D40 and D42

**Decision: the home page draws the website's one footer, question, tab and clock included, and
№05's closing row stays too ("keep both"). №04's cards stop right under the condensed menu bar,
reach the screen's foot, rest a third of a screen each, and stack on every screen that allows
motion; a card taller than the screen scrolls until its last line shows, then stops. №02's cards
open without the 120 ms pause. №03's garment zooms only after a click on it, and its colours
cross-fade. The smooth scroll glides for 0.8 s. Owner, 2026-10-17, answering the home page audit.**

The footer: the owner asked for it "100% identical across the whole website", and accepted that
"Start a conversation" then shows three times on the home page and the works' clock twice, an
exception to the no-repeat rule. №04: the cards stopped 84px down under a 52px bar, leaving pale
strips, and from #197 stacked only on screens 800px tall or more, so no iPhone in Safari stacked.
The rest is the gap between cards, because the next card used to cover the last line being read.

The SME Climate Hub badge (owner, 2026-10-17): the company made the Hub's commitment (net zero
before 2050, signed 12 October 2026), so both footers end "Standards" with "SME Climate Hub:
Committed" and the marks with the "Committed 2026" badge, a link to the company's row in the Hub's
public list. "Committed", never "Certified". The badge is for one year; the 2027 one replaces it.

The footer is one screen from 768px with the real facts (owner: "fit every size"). It had passed
the one-screen tests on CI's empty footer while the live one measured 1,052–1,146px on a 900px
screen. Plain-text lines are no longer 44px touch rows, Standards takes two columns and the marks
sit beside it from 1280px, a tablet's question is smaller and its legal row one line, and the
outline wordmark stops growing at 1500px. The tests now measure the live facts.

The website may load two stylesheets, the same two on every page (owner, 2026-10-17): Turbopack
splits the shared stylesheet once it passes about 137 KB, and both are the layout's, so a second
page still reads them from the cache. `e2e/firstPaint.spec.ts` allows at most two, the same set on
every page. №04's stopped cards start at the screen's top edge with the menu bar floating over
them, so no pale page shows beside the bar.

Further answers the same evening (owner, 2026-10-17): the garment pages draw the whole footer too,
tab, question and clock, laid out identically, beside their own "Ask about this garment" (Q11; the
prompt loads lazily, and the garment pages' style budget rose 14,000 -> 15,706 bytes by the two
measured steps the owner approved); №04's step 05 shows the front of the works, so the hero's
stitching floor is not shown twice (Q12); Sports Accessories says "[ ask us ]", as they are made
today (Q13); the small repeats stay (Q14); the works' clock keeps Mon–Sat hours (Q15); the footer's
social links open in a new tab and say so; on a phone a strip down each side of №03's garment
scrolls the page; №05's figures count up without moving the page; and on a phone the colour behind
Safari's bar is the page's paper, the footer's only while the footer is on screen.

**Guard:** `apps/cms/src/components/site/SiteFooter.test.ts` and `apps/cms/e2e/footer.spec.ts` (the
home footer is the same footer), `apps/cms/e2e/orderTimeline.spec.ts` (13 sizes, three planted
faults), `apps/cms/e2e/familyTickets.spec.ts` (no pause), and `apps/cms/e2e/liveGarment.spec.ts`
(zoom after a click, the cross-fade); `standardsLogos.test.ts`, `SiteFooter.test.ts`, the viewer's
`Footer.test.tsx` and `e2e/siteFooter.spec.ts` (the badge); `footer.spec.ts` DS-09 and LA-13 with
`e2e/fixtures/live-footer-facts-2026-10-17.html` (one screen with the live facts).

## 2026-10-19 — the home page's motion

### D47 · №02 opens slower than it closes, №03's colour spreads like dye, №04 stacks one step to a card on a phone, the footer's wordmark is cut on an iPhone too — amends D42, D43 and D46

**Decision: №02's family cards open over `--settle` (0.5 s), the words arriving 40 ms apart, and
close over `--ui` (0.22 s); still no pause before the open. A colour picked in №03 spreads over the
garment from the chosen dot like dye, over `--slow`, and a garment still turning by itself turns a
little with it; with the 3D off the still picture is wiped the same way. Below 900px, for someone
who allows motion, №04's eight steps stack one by one, each sinking back to 94% and dimming as the
next comes over it; the computer keeps its four stage cards and they do not animate. The footer's
outline wordmark loses a quarter at the page's end on every browser, the iPhone included. The
phone's status bands stay as they were. Owner, 2026-10-19.**

№03: the owner watched two options recorded on the live hoodie (dye spread and turn; slow fade and
zoom) and chose the dye; the fade showed the turning garment twice at once. №04: the owner asked
for "single card stacking" on a phone and, asked whether D42's "nothing animates" should hold
there, chose the sink. The phone's bands: both other options were built and shown in the iOS 26.5
simulator (the top band following the section under it; always paper; the bottom band dark always),
and the owner kept both as they were ("Dark always" at the top). Reading WebKit's own source for
that showed how Safari really picks the top band's colour, now noted at the strip in
`packages/ui/src/notch.css`. The wordmark: a negative margin
cut it in desktop browsers, but iOS 26.5 Safari grew the footer around anything the wordmark let
spill, so the letters stood whole there. Moving the drawing (`translate`) cut them on the iPhone but
took the 0.2em out of the footer's quiet band, under D7's floor at 768px. The wordmark's box is now
its line less 0.2em and clips itself, which cuts 0.2em in every engine with the layout the footer
had (read in the simulator: box foot and slab foot both at 713.5px, the letters to 722.7px).
The owner then asked for the strip under Safari's pill to be part of the footer too. At a page's
end Safari brings its bar back and the page ends at its top edge; `viewport-fit=cover` changed
nothing in a Safari tab, so nothing on the page can draw there, and the strip already takes the
footer's colour. Shown four edges in the simulator (hard cut, soft fade, whole word, half cut and
fade), the owner chose the soft fade, on phones only: the slab's last 20px fade the grid and the
letters into that colour, and computers keep the hard cut.

**Guard:** `apps/cms/e2e/familyTickets.spec.ts` (both speeds and the stagger),
`apps/cms/e2e/liveGarment.spec.ts` and `apps/cms/e2e/proofShowcase.spec.ts` (the wipe's origin, its
edge, that the circle grows rather than cuts, the turn), `apps/cms/e2e/orderTimeline.spec.ts` (the
eight step cards at every phone size, the sink, the lists in Chromium's accessibility tree), and
`apps/cms/e2e/footer.spec.ts` (the wordmark's cut at three widths). Each had a fault planted and
failed on it.

## 2026-10-26 — the site check (Hallmark, Impeccable, claude-seo)

### D48 · The site check's answers: every finding fixed or decided, in one change

**Decision: the owner answered every finding of the 26 October check, section by section, and
asked for all of it in one pull request. Built: the order cards' last line clears the fade; the
factory gallery flows in two columns with The Building full width (sharp 2400 and 3200px files cut
from the original); each figure is said once per page (About's cards and table leave the count-up
band's figures to it, Factory's lines leave the solar share to its stat); the About bands merge
into one section; the contact hero has two plain buttons, "Email us" and "WhatsApp us"; the
products count is said by the family chip only; the guides' author is "M. Hateem Jamshaid,
Business Development Director", About included; the phone field shows a "Code" label; em dashes
in the site's own words are replaced, each shown first; titles end " | RUN APPAREL"; sixteen pages
get a search title of their own (`metaTitle`), the short title staying their breadcrumb, footer
link and `llms.txt` line; Factory and Careers link the policies; and every page the sitemap lists
now carries a measured `lastmod`. Owner, 2026-10-26.**

Kept as they are, by the owner's choice: the products film hero (decided 1 October); the factory
photos shown twice until new photos exist; №05's 100,000 as the bento's feature; the label-first
figure (VA-58); invented colour addresses answering 200, which protects printed tags; the
Hallmark word and fold budgets; the footer's columns on a phone; home №04, so the order guide's
steps still appear there too. Journal and Case studies keep their short titles until each has a
first post. Decided by the evidence and reported to the owner: the factory headline keeps its
no-swap font (`.hero-legal`, twelve page types, no layout shift); no `overflow-x: clip` guard (it
would hide an overflow the e2e suite measures); the sitemap's picture entries stay full size
(Google Images asks for a high resolution). A policy's "Last reviewed" date does not move for a
new search title (owner, asked the same day): the date check leaves `metaTitle` out.

The new dates (`apps/cms/src/lib/pageDates.ts`): the 22 pages without a byline are each dated by
the commit that brought their present words to `main`, found by fingerprinting each page at every
earlier `main` commit; a page that shows garments or posts takes the newest one's date when it is
later (`sitemapFor` in `apps/cms/src/lib/searchVisibility.ts`). A page drawn in JSX is fingerprinted
from its source without comments or spaces, so a markup change can move its date a little early;
the owner's rule is a date that never stands still while the words change.

Left for after the merge, each write approved first: five dots and 200 poster alt texts in the CMS,
49 em dashes in garment customization copy, and R-MM's literal asterisks.

**Guard:** `apps/cms/src/lib/searchTitles.test.ts` (the sixteen titles word for word, within 60
characters, none repeated), `apps/cms/src/lib/pageDates.test.ts` (every listed page dated, and its
words held to the date), `apps/cms/src/lib/searchVisibility.test.ts` (a newer garment dates the
home page, /products and its own buyer page only), `apps/cms/src/lib/aboutPages.test.ts` (a figure
said once per page), `apps/cms/src/factoryPhotos.test.ts` (the full-width photo is sharp) and
`apps/cms/src/lib/bylines.test.ts`. Each had a fault planted and failed on it.

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
