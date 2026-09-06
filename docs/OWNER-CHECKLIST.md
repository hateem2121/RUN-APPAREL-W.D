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
| **"EST. LINEAGE 1889"** | Home page headline strip |
| **"We reply within 2 business days"** | Home and Contact — this is a promise; it should be one you can keep |
| **"100% B2B manufacturer"** | Home page |

The 1889 line and the 2-day reply are the two worth pausing on. The first is a heritage
claim a buyer may ask you to substantiate; the second is a commitment in writing.

---

## 3 · Turn on visitor analytics (about 5 minutes)

**Why me.** The token is created against your Cloudflare account and cannot be generated
from the code.

There is currently **no way to tell whether these pages produce a single enquiry**. The
code for this is already written and does nothing until you supply a token.

1. Sign in to Cloudflare and open **Analytics & Logs → Web Analytics**.
2. Choose **Add a site**, and enter `wear-run.help`.
3. Cloudflare shows a snippet containing a **token** — a long string of letters and
   numbers. Copy just the token.
4. Send it to me, or set it yourself with:

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec wrangler secret put CF_ANALYTICS_TOKEN
```

**You are done when** the site reports visitors in that dashboard within a day of going
live.

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

## What I could not close, and why

Stated plainly so nothing here reads as finished when it is not.

| Not covered | Why |
|---|---|
| **Real screen readers** | Automated checks cover structure, labels and contrast, and 72 browser tests cover keyboard use. Nobody has listened to these pages with VoiceOver or NVDA. |
| **Many visitors at once** | Not load-tested. Phase C's caching is what makes this matter less; until then every visit rebuilds the page. |
| **The live production site** | These pages are not deployed. Every measurement comes from a local production build and the real Workers runtime — close, but not the live host with real network distance. |
| **Real product photos at full scale** | Your local database has one real poster; production has more. Photo weight for a full catalogue is projected from the files on disk, not observed. |
