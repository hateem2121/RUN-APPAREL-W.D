# Owner checklist — the things only you can do

Short list. Everything else about the public site is automated and gated; these four
items are outside what any test can reach, either because they need a real phone in a
real hand or because they are claims about your business that only you can confirm.

Nothing here blocks anything today — the site is not live. Items 1 and 2 should be done
before it goes live; 3 and 4 whenever suits.

---

## 1 · Check the site on your own phone

**Why me and not a test.** All 36 screen sizes were checked in simulated browsers, and
that catches layout faults. It cannot tell you how the site *feels* — whether tapping is
comfortable, whether scrolling stutters, whether text is readable at arm's length in
daylight. No simulator answers those.

**How.** Run the site locally and open it on your phone, or wait until it is live.

1. Open the home page. Read it once, top to bottom, without stopping.
2. Tap **PRODUCTS** in the top bar. Then **CONTACT**. Then the RUN APPAREL name to get home.
3. On Contact, tap the email address and then the WhatsApp number. Both should open the
   right app with the right address already filled in.
4. Turn the phone sideways on each page.

**You are done when** nothing needed a second tap, nothing was cut off at the edges, and
you never had to pinch to read.

**Tell me if** anything felt small, slow, or cramped — that is exactly the class of thing
the automated checks are blind to.

---

## 2 · Confirm the facts on the pages are true

**Why me and not a test.** I checked the writing. I cannot check whether it is correct —
a wrong address or an unsupportable claim is invisible to every gate in this repo, and
structured data now repeats these to Google and to AI search, which makes a mistake
travel further than it used to.

Check each of these and tell me if any is wrong:

| Claim | Where it appears |
|---|---|
| `13 Km Daska Road, Sialkot, 51040, Pakistan` | Contact page, and the structured data on every page |
| `partner@wear-run.com` | Contact page, home page, footer |
| `+923361777313` | Contact page, footer, WhatsApp links |
| `RUN APPAREL (PVT) LTD` | Footer, and the structured data |
| ~~**"EST. LINEAGE 1889"**~~ — **answered 2026-09-07**, being reworded | Home page headline strip |
| **"We reply within 2 business days"** | Home and Contact — this is a promise; it should be one you can keep |
| **"100% B2B manufacturer"** | Home page |

The 2-day reply is the one worth pausing on: it is a commitment in writing.

The 1889 line is **settled** — you confirmed on 2026-09-07 that your family began
manufacturing and exporting in 1889 and has done so since. That is a stronger claim than
the old wording carried, and it is being reworded to say so plainly. See
`docs/DECISIONS-BETA-WEBSITE.md`.

---

## 3 · ~~Turn on visitor analytics~~ — **DONE 2026-09-07**

You asked me to do this one, and it is finished. Nothing is left for you here.

Two things were already in place: `wear-run.help` had been added to Cloudflare Web
Analytics a month ago (it is showing 100 page views in the last 24 hours, from the two
PDFs the apex serves), and `viewer.wear-run.help` was added four days ago.

What was missing was the token reaching the site's code. I read it from your Cloudflare
dashboard and set it on the Worker:

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec wrangler secret list
```

`CF_ANALYTICS_TOKEN` now appears in that list beside `PAYLOAD_SECRET`, `RESEND_API_KEY`
and `SENTRY_DSN`.

⚠️ **It reports nothing yet, and that is correct.** Fetched live the same day,
`cms.wear-run.help` serves a private holding page — the marketing site is not deployed
anywhere. The counter starts when the site launches.

**You are done when** the site reports visitors in that dashboard within a day of going
live. Nothing to do until then.

**What you get.** Visitor numbers, which pages they read, and where they arrived from. It
sets no cookies, so it needs no cookie banner and collects nothing personal — that is why
it was chosen over Google Analytics.

---

## 4 · Replace the browser tab icon with your real logo

The icon on the browser tab is still the draft mark from the old website repository.

1. Open the CMS admin, go to **Photos & 3D files**, and upload your logo. A **square**
   image works best — around 512 x 512. A wide logo gets squashed into a small square
   and becomes unreadable.
2. Go to **Settings → Company logo (browser tab icon)** and pick the file you uploaded.
3. Save.

**You are done when** the tab shows your mark instead of the black-and-green R.

---

## 5 · Fill in the three footer blocks (about 10 minutes)

**Why me.** Each is a claim about the business. The footer shows nothing for a blank one —
it will never invent a certification — so until you type them, buyers see Contact only.

Open the CMS admin, go to **Settings**, and fill in:

1. **Capacity** — your minimum order (e.g. "50 pcs per style"), your usual lead time, and
   your working days and hours in Sialkot time. The hours also switch on the little
   "Open now" light beside the clock; leave them blank and there is no light.
2. **Certifications** — only standards you hold today. Add one row per certificate.
3. **Social links** — one row per live account, with the full `https://` address.

Optional: **Works coordinates** under the address, only if you know them to be right.

**You are done when** the bottom of any page shows the blocks you filled and nothing you did not.

---

## 6 · Numbers a buyer will look for (about 15 minutes)

**Why this matters.** Your whole marketing site currently contains **two** checkable
numbers. A manufacturing buyer decides whether to enquire by looking for specifics — can
this factory take my order, and how fast. Adjectives do not answer that; numbers do.

**Nothing here is published until you confirm it.** Leave anything blank that you cannot
stand behind — a blank is fine, a guess is not. Several of these already have a home in
the CMS (section 5 above); the rest would go on the home and contact pages.

Answer whichever you can:

| # | Question | Example of a good answer |
|---|---|---|
| 1 | How many garments can you produce per month? | `40,000 pieces / month` |
| 2 | What is your minimum order, per style and colour? | `100 pieces per style, 50 per colour` |
| 3 | How long from approved sample to shipment? | `21–28 days` |
| 4 | How long to produce a sample? | `7–10 days` |
| 5 | How many people work at the factory? | `180` |
| 6 | How big is the factory? | `45,000 sq ft` |
| 7 | Which certifications do you hold **today**? | `OEKO-TEX Standard 100`, `SEDEX` |
| 8 | Which countries do you currently export to? | `UK, Germany, Australia` |
| 9 | How many years has the business been exporting? | Answered — since **1889** |
| 10 | Any named customers you are allowed to mention? | Only ones who have agreed |

**A warning worth reading.** Numbers 7 and 10 are the two that can cost you. A
certification you no longer hold, or a customer who has not agreed to be named, is worse
on your website than nothing at all — it is the first thing a buyer's compliance team
checks. If you are unsure about one, leave it out.

**You are done when** you have sent me the answers you are confident in. I will draft the
wording, show it to you, and publish only what you approve.

---

## 7 · Two things about the new contact form (about 10 minutes)

The contact page now has a form. Every message is **saved into your CMS first, and only
then emailed** — so if the email ever fails, the message is still there under **Inquiries**.
That ordering is the whole design and it means an outage can cost you a notification but
never an inquiry.

### 7a · Confirm the domain is verified in Resend

`RESEND_API_KEY` is already set on your Worker — I found it there. What I could not check
is whether `wear-run.help` is **verified** in Resend, because the key is a secret the
platform will not read back to me.

⚠️ **There is a reason to doubt it.** Your domain's SPF record names Hostinger, Google and
SendGrid — not Resend. If Resend has not been given the domain, every notification fails.

1. Sign in to Resend and open **Domains**.
2. If `wear-run.help` is not listed as **Verified**, add it and follow the DNS steps.
3. If you would rather not, tell me and I will switch the form to a service you already
   use — the code that sends the mail is one function.

**How you will know either way:** open **Inquiries** in the CMS. Every row has a
`notified` tick. If a row is saved but unticked, the message reached you and the email did
not, and the reason is written on the row beside it. Nothing is ever lost while you decide.

### 7b · The site now spells things the American way

You decided this on 2026-09-04 — "colorway", "color", "inquiry" — because colorway is the
higher-volume search term in the US and Canada. The 3D pages followed it; the marketing
site was built afterwards and did not, so a buyer could read "5 colours" on one page and
"COLORWAY 01" on the very next one.

The site's wording now matches, and the footer button says **"Start an inquiry"**. Nothing
is needed from you — this is here so the change does not surprise you.

---

## What I could not close, and why

Stated plainly so nothing here reads as finished when it is not.

| Not covered | Why |
|---|---|
| **Real screen readers** | Automated checks cover structure, labels and contrast, and 72 browser tests cover keyboard use. Nobody has listened to these pages with VoiceOver or NVDA. |
| **Many visitors at once** | Not load-tested. Phase C's caching is what makes this matter less; until then every visit rebuilds the page. |
| **The live production site** | These pages are not deployed. Every measurement comes from a local production build and the real Workers runtime — close, but not the live host with real network distance. |
| **Real product photos at full scale** | Your local database has one real poster; production has more. Photo weight for a full catalogue is projected from the files on disk, not observed. |
