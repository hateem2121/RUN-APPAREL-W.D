---
name: visual-audit
description: Re-run the website and garment-page visual audit — layout at 14 screen sizes, axe, a keyboard Tab walk with the cookie card open, font-swap layout shift, Lighthouse and a phone profile — the way the 2026-10-01 audit measured it, without its false findings.
when_to_use: When the owner asks to audit the site's look, layout, accessibility or speed, or to check a design change before and after.
disable-model-invocation: true
---

# Visual audit of wear-run.com

**The owner starts this.** It loads the live site many times; on a phone hotspot that is
mobile data, so say how many page loads before starting.

The report is a PRIVATE claude.ai artifact, never a file in this repo: the repo is public
and the root `CLAUDE.md` bans committing audits. Measurement scripts and their output stay
in the session's scratchpad for the same reason.

## Before anything else, read the decisions

Several "findings" of the 2026-10-01 audit were decided long before it. Grep first:

- `docs/DECISIONS-BETA-WEBSITE.md` and `docs/DECISION-*.md` — e.g. D1 (one long products
  page), D4 (four columns from 1600px), D18 (no camera momentum), D26 (`--showpiece` motion).
- Earlier audit IDs live in code comments, not in `docs/`, so `git grep` the ID: FA-B-04
  (ragged card rows are deliberate) is in `apps/cms/src/app/(frontend)/site.css`; VA-32
  (colour dots with the chosen name above, a list only in a tall side column, names
  breaking only after a "/") in `apps/viewer/src/styles/page.css` — it reopened and
  replaced SZ-06's soft hyphens on 2026-10-02, owner decision.
- `docs/DESIGN.md` — page widths, breakpoints, the type scale, reduced motion as a hard stop.
- `packages/shared/src/pageTitle.ts` — the tab-title format, brand dropped past 60 characters.
- The contact form marks OPTIONAL fields, never required ones (the UK government pattern).

## What to measure

1. **Layout at 14 sizes** — 320, 360, 375, 390, 414, 430 wide phones; 640×360, 667×375,
   844×390 sideways; 768, 1024, 1280, 1440, 1920, 2560. Overflow, tap targets, what the
   first screen shows.
2. **axe-core** on every page at 390 and 1440, light and dark.
3. **A Tab walk with the cookie card open**: for each stop, is the focused item ENTIRELY
   under the card (WCAG 2.2, 2.4.11)? Partly covered passes.
4. **Font-swap layout shift** on the text-heavy pages (privacy, terms, guides) at 360–430
   and 768, with web fonts allowed and then blocked.
5. **Lighthouse** mobile and desktop, one page at a time.
6. **A phone CPU profile** of a garment page, only with the real graphics chip (below).

## Traps that produced wrong numbers last time

- **The cookie card and the cursor are ABSENT under automation** (`navigator.webdriver`).
  Lift it in an init script, or every layout number is of a page no visitor sees — and a
  side effect of the card (it once threw every garment visit to the footer) is invisible
  to every suite except the two `consent.spec.ts` files.
- **Reduced motion ON for layout**, or the entrance reveals move elements mid-measurement.
  Assert `matchMedia('(prefers-reduced-motion: reduce)').matches` — a config option alone
  has failed to reach the page before.
- **Headless Chromium draws 3D in SOFTWARE by default.** A profile measured a 1,789 ms
  "freeze" that was 258 ms on the real chip. Launch with
  `--use-angle=metal --ignore-gpu-blocklist --enable-gpu` before believing any WebGL time.
- **`locator.click()` scrolls its target into view first.** To test what a click does to
  the page's scroll, use `page.mouse.click(x, y)` on something already on screen; a test
  once measured Playwright's own 621px scroll.
- **A full-page screenshot over 65,535px tall is an empty JPEG** (/products at 390 ×3).
- **A focus ring is drawn OUTSIDE the element** (`outline-offset`), so contrast sampled
  inside the element's box is the wrong pixels.
- **WebKit skips links and buttons on Tab** unless the key is `Alt+Tab`.
- **The website's e2e reuses an old build locally** — rebuild before trusting a run.
- **Start servers only on their own ports**: viewer 4173, website 4174.
- **If wear-run.com times out over the iPhone hotspot**, it has been the hotspot's route to
  one Cloudflare range, not the site: check the uptime monitor before calling it an outage.

## Writing it up

Severity: red blocker, orange major, yellow minor, blue polish. Every finding gives the
measurement, the cause in the code (file and line), the fix and its dated source. List what
passed too. Questions for the owner go last, each with a recommendation.
