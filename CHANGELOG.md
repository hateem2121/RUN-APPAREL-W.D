# Changelog

> **What is this?** A short list of what changed, newest first.
> Each version is named by its date, like `2026.09.25`.
> The full detail of every change is in the [pull requests](https://github.com/hateem2121/RUN-APPAREL-W.D/pulls?q=is%3Apr+is%3Amerged).

The layout follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions use the date they went live (owner's choice, 2026-09-26).

```mermaid
timeline
  title From first line of code to launch
  July 2026 : Project starts : First real garment on a phone
  August 2026 : Colour names read from the file : Printed logos kept sharp : Site made safer
  Early September 2026 : Sixteen garments live : Repository becomes public
  25 September 2026 : Website launch
```

## [Unreleased]

### Added

- PostHog, under the same cookie question: for visitors who press Accept, it records how they use each page (clicks, scrolling, the 3D viewer) so the owner can watch the visit back. What anyone types into a form is hidden before it leaves their browser.
- A cookie question on every page. Google Analytics and Apollo (which shows which companies visit) start only if a visitor presses Accept; nothing is stored before that. A "Cookies" link in the footer of every page brings the question back.
- A picture-first front page, with a door each for RUN staff, developers and AI agents.
- A picture guide for RUN staff, in six short pages.
- A code of conduct, a help page, and three simple forms for reporting a problem.
- A robot that checks every picture has a description and every diagram draws.
- Search robots now read each garment's name, picture, description and colours on its page, not only in hidden data.
- The sitemap tells Google when each garment last changed and where its picture is.
- A one-command check of every page for search problems (`node scripts/seo-crawl.mjs`).
- Four buyer pages, one each for Teamwear, Sportswear, Outerwear and Casual Wear: what is made, the minimum, the sample time, how an order works and six common questions. The home page's family cards now open them.
- Three buyer guides under `/guides`: how a private label order works, the 3D garment reference explained, and minimum order and samples. A "Guides" link in the footer of every website page opens them.
- Three more buyer guides: garment printing methods, sportswear fabrics and weights, and private label packaging.
- A guide to shipping and import duties: the four ways an order ships and the price terms quoted.
- The Sports Accessories card on the home page shows a photo of RUN backpacks instead of "Photo to come".
- Each garment can carry a plain garment type ("Women's Tennis Dress"), and its page title now says it.

- New website pages: policies, careers, community, a careers form, questions and answers, a word list, a journal, case studies and a press page ([#141](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/141), [#143](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/143)).
- The about page and an inside-the-factory page with photos ([#154](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/154)).
- Buyer guides, a file AI assistants can read about the company, and 3D model data search engines understand ([#139](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/139), [#152](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/152)).
- The Structure Polo Set is on the site with its pictures, marked "3D coming soon" while its 3D file is redone ([#149](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/149)).
- Forms show upload progress, and the site keeps working when a visitor's browser translates the page ([#181](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/181)).
- High-contrast colours for people who switch them on, built into the design system ([#216](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/216), [#218](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/218), [#223](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/223)).

### Changed

- The home page was rebuilt section by section: the roof photo with four figures, an order in four stage cards, family cards that open with their lists, and one ask at the end ([#194](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/194), [#195](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/195), [#197](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/197), [#199](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/199), [#200](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/200), [#203](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/203)).
- The home page's title now says "private label sportswear", and every buyer page links two buyer guides ([#231](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/231)).
- Faster on phones: the products page lays out sooner, Archivo is cut to the widths the site uses (a third smaller on a first visit), the garment page paints in 868 ms instead of 2,304 ms on slow 3G, and garment data answers from cache ([#142](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/142), [#206](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/206), [#213](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/213), [#214](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/214)).
- Search robots get each garment's picture and words in the page itself, so Google never reads a slow 3D load as an empty page ([#220](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/220), [#232](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/232)).
- Colour names say their colour, and the muted and volt colours are dark enough to read on every light background ([#131](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/131), [#222](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/222)).
- The shrink robot's container runs on Debian 13 ([#211](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/211)).
- This repository's instructions, guides and code comments were checked against the live site and the code, and corrected where they had gone out of date; CI now runs on Node 26; the unused Cloudflare Pages rollback was removed, and 39 finished plans, specs, session logs and other old records were deleted (each is still readable at commit bd384f3c).

- Every outside package moved to its newest stable version ([#72](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/72)).
- Error reports now use Sentry 11, and the privacy page says exactly what they include ([#72](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/72)).
- The last fixes from the launch checklist ([#71](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/71)).
- The AI instruction files are shorter, and each rule sits where it applies.
- The company's LinkedIn and Instagram, already in the footer, are now also in the data search engines read.
- The products page's title in search results now says what is sold, in the owner's words.
- One misspelled garment name is corrected (RAGLAN).
- Visits from a developer's machine or a test are marked internal, so Google Analytics counts real visitors only.

### Fixed

- The website no longer fails with Error 1101 under heavy traffic ([#145](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/145)).
- Google Analytics visits are no longer lost ([#176](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/176)).
- A crash no longer tells buyers a garment was discontinued ([#188](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/188)).
- A garment page left open during an update reloads once and shows the garment in 3D, instead of a notice ([#217](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/217)).
- Safari's bottom strip on iPhone matches the page again ([#211](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/211)).
- Two critical security advisories in Next.js are closed ([#223](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/223)).
- Four security advisories published on 23 October no longer block the deploy: undici, body-parser, happy-dom and zod 4 now use their fixed versions, and the one copy with no fix (zod 3 inside the Lighthouse speed tool) is listed with its reason.
- Server errors reach Sentry, and the weekly error report no longer counts our own speed robot ([#190](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/190), [#191](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/191)).
- Checks that failed for reasons other than the code: the speed test, the shrink deploy check, the footer probe and several browser tests ([#166](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/166), [#178](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/178), [#180](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/180), [#183](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/183), [#198](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/198), [#201](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/201), [#228](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/228)).

- The weekly model check now reads each model's own size marker instead of a fixed guess, so a larger model no longer turns the check red.
- The script that draws the website's sharing picture runs again after the test-tool upgrade.
- The shrink robot's container gets the same small updates the rest of the code got.
- A garment address that does not exist now answers "not found" to search robots; people still see the helpful page.
- Google can now read the garment pages. A rule meant to keep search engines out of the admin data was also hiding each garment's details from Google, so it refused all 205 pages.

## [2026.09.25] — the website launch

The public website at [wear-run.help](https://wear-run.help) opened to search engines ([#69](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/69)).
This version holds 60 changes made between 10 and 25 September 2026.

### Added

- A home page with an "Inside the factory" photo strip ([#67](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/67)).
- Private links for our catalogue and company profile, with visit records ([#12](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/12), [#16](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/16)).
- One shared menu bar for the website and the 3D viewer ([#38](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/38)).
- The viewer notices a 3D download that stops, and offers to try again ([#43](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/43)).
- Test robots for phones, screen readers, speed, layout and colour.

### Changed

- Smooth scrolling on the website, like the viewer's ([#62](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/62)).
- Our reply promise is 24 hours everywhere ([#63](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/63)).
- The loading screen and styles arrive with the page, so a slow phone sees something sooner ([#57](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/57)).

### Security

- Backups leave GitHub only in locked (encrypted) form ([#1](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/1)).
- The website runs only scripts it has stamped as its own ([#23](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/23)).
- A security contact file on every web address ([#17](https://github.com/hateem2121/RUN-APPAREL-W.D/pull/17)).

## Earlier history (before this repository went public)

These changes were made in an older, private copy of the code.
Their pull request numbers belong to that copy, so they are not linked here.

### Early September 2026

- Eleven garments went live, then sixteen.
- A product-page check led to 23 fixes for access, search and phones.
- The repository became public on 10 September.

### August 2026

- Colour names are read from the 3D file instead of typed by hand.
- The system refuses to save a garment whose printed logo was damaged.
- The "Smallest file" setting was removed, because it blurred logos.
- Every garment and colour got its own link preview.
- The site was made safer: checked backups, locked-down builds and a non-admin robot.
- The 3D viewer was fixed for small phones.

### July 2026

- The project started on 21 July.
- Uploading a raw 3D file and shrinking it with a robot began to work.
- The first real garment showed in 3D on a phone.
- The first fixes to keep printed logos sharp.
