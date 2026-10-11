# Site health fixes (11 Oct 2026) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (Native). This owner's
> rule: the work happens in the one conversation, at most one reviewer helper at the end. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the four problems found on 11 Oct 2026. They are the red Lighthouse robot on
`/products` (phone), a Firefox test that fails without a cause on record, out-of-date text in
three files, and Search Console's "Merchant listings" and "Product snippets" warnings. All four
ship as ONE pull request.

**Architecture:** Four independent fixes on one branch, each with its own test cycle. The
Lighthouse fix changes one CSS rule, chosen by measuring the live page. The flake fix makes the
test record its own evidence and measure the settled page. The text fix edits three files. The
product-label fix changes what the garment Worker tells crawlers, as the owner chooses.

**Tech Stack:** Next 16 + Payload (apps/cms), React + Workers (apps/viewer), Playwright 1.63,
Vitest, Lighthouse 13.5.0, pnpm 12.6.0 (`npx --yes pnpm@12.6.0`).

**Spec:** There is no separate spec. The owner asked for a plan directly, and the measured
findings below are what it argues from.

> **Executed 2026-10-11.** The owner chose Option A for Task 4 and inline execution. The rulings
> made during the work, where it departed from these steps, are listed in the pull request that
> adds this file.

## What was found (measured 11 Oct 2026)

1. **Lighthouse `products.mobile: accessibility/target-size`** has failed every live run since
   PR #128 (polish build, deployed 5 Oct 16:09 UTC). The last pass was `11435aa7` on 5 Oct at
   00:39. Cause: `site.css:3090-3094` (`.gallery-group + .gallery-group { content-visibility:
   auto; contain-intrinsic-size: auto none auto 1200px }`, polish S9) stands each undrawn group
   in at 1,200px.
   - On a 412px phone the Teamwear group is really 3,446px tall. Unscrolled, its cards spill
     2,246px past the stand-in and lie on top of the next group's cards.
   - A local Lighthouse run found 9 card links "partially obscured". The links overlap at 3,964
     and 3,987px.
   - A fresh page in the built-in browser gave the same numbers to the pixel. Control: with the
     skip switched off there is no overlap, and Teamwear measures 2,426-5,872px.
   - Real taps were never affected (15 of 15 sampled points hit the right link).
   - For a visitor, the page grows by 2,246px when that group is drawn (1,200 → 3,446 measured).
     The family chips (`#casual-wear`…) presumably land by the stand-ins too; that is NOT
     measured.
   - The PR-time `lighthouserc.json` measures only `/n001/wine`, so nothing before a merge looked
     at `/products`.
2. **Firefox flake, `apps/viewer/e2e/motion-and-layout.spec.ts:3194`.** This morning it failed 3
   times in 20 runs, in the worktree removed today; its traces went with that worktree. Today in
   the main folder it passed 30 of 30, then 60 of 60 with 12 Firefox windows at once, so **its
   cause is NOT known**.
   - The one failure message on record said Email was missing while WhatsApp was on screen.
     Beside the garment the two buttons share a wrapping row with Email first, so a plain
     overflow would drop WhatsApp first. That rules out the obvious cause.
   - CI hides it with `retries: 1`.
   - The sibling test at :3561 already waits for fonts plus two frames, after measuring a
     fallback-font difference on 2026-09-25.
3. **Stale text:**
   - `docs/README.md:195` says "The fourteen decisions"; DECISIONS-BETA-WEBSITE.md now runs to D37.
   - `apps/cms/src/securityTxtRoute.test.ts:10` says "613 bytes" (616 since 11 Oct).
   - `SECURITY.md`:
     - its scope lists `viewer.wear-run.help` and `media.wear-run.help` and omits `wear-run.com`;
     - it says the viewer "sets no tracking cookies" (the cookie banner has loaded trackers
       after Accept since 30 Sept);
     - it says the CMS stores "staff accounts … and product content only" (the contact form has
       stored enquiries since 7 Sept);
     - it links `wear-run.help/privacy` (the site has been `wear-run.com` since 28 Sept).
4. **Search Console warnings.** URL inspection of `wear-run.com/products/rxps/wine` (last
   crawled 30 Sept):
   - **Product snippets:** ERROR "Either "price" or "priceSpecification.price" should be
     specified"; warnings for no review, no aggregateRating, no priceCurrency and "Invalid enum
     value in field availability".
   - **Merchant listings:** ERROR "Either "price" or "priceSpecification" should be specified";
     warnings for no shippingDetails, no hasMerchantReturnPolicy and the same availability
     warning.

   Every one comes from the price-less `Offer` that decision D10 asks for (`preview.ts:546-551`).

   Google's docs (product-snippet page updated 2026-09-08; merchant-listing page, both read
   11 Oct):
   - product snippets need a review, a rating, or an offer WITH a price;
   - merchant listings are "Only pages where a shopper can purchase a product", and need a price
     greater than zero;
   - `MadeToOrder` is on neither list of availability values.

   `docs/RUNBOOK.md:2510` already calls the warning "expected, not a fault".

## Decision needed from the owner (Task 4)

- **A (recommended):** stop labelling garment pages as products for sale. The product block goes
  and the breadcrumbs stay. Both warning types stop once Google recrawls.
- **B:** remove only the price-less offer. Merchant listings stop. Product snippets keep one
  notice ("needs offers, review or rating").
- **C:** keep D10 as is. The warnings continue.

D10's first sentence (never a price) stands under every option.

## Global Constraints

- ONE branch, `fix/site-health-2026-10-11`, off `main`, ONE pull request. The owner merges. Delete
  the branch locally after the merge (owner's one-branch rule, 10 Sept and 11 Oct).
- `git config user.email` is set before the first commit (the address in `.claude/rules/deploy-and-live-checks.md`).
- Public repo: commit code, tests and docs only. Throwaway measurement scripts live in the session
  scratchpad, never in the repo.
- Never a price, a currency or a number beside a garment in machine-readable form (D10).
- Comments say WHY and cite the measurement, in the house style of the file being edited.
- Every new test must be shown failing the way production fails (negative control), then passing.
- Browser tests one run at a time; `lsof -nP -iTCP:4173 -iTCP:4174 -sTCP:LISTEN` first. If another
  session holds a port, stop and wait.
- Before the merge: a D1 backup + `rxps/wine` capture (the CMS is touched).
- Push once, then wait; judge a run by its `conclusion`.

## Review Focus

1. A phone visitor taps the "Casual Wear" chip at the top of `/products`. They should land with
   that group's heading just under the bar, with no later jump. `oneListPerFamily.spec.ts` ("a
   chip lands its group below the bar") runs in Task 1, step 5.
2. A keyboard user tabs from the first group into the second. Focus should land on that group's
   first card, on screen. `oneListPerFamily.spec.ts` runs in Task 1, step 5.
3. Someone prints `/products`. Every group should print in full. A1 needs no print rule. A2 keeps
   one (in its code below).
4. Googlebot fetches a garment page after Task 4. It should still get the title, the words, the
   picture and the breadcrumbs. Task 4's test asserts the BreadcrumbList and the robot copy.
5. A 1024x620 laptop window in Firefox should show Email and WhatsApp. The test's own assertion
   covers this, now with evidence attached.

---

### Task 0: Branch and preflight

- [ ] `git switch -c fix/site-health-2026-10-11`
- [ ] `git config user.email` → expect the address in `.claude/rules/deploy-and-live-checks.md`
- [ ] Copy this plan to `docs/superpowers/plans/2026-10-11-site-health-fixes.md`, then commit
  ("Plans: the four fixes of 11 October, from what was measured").

### Task 1: `/products` stops standing groups in at a guessed height

**Files:**
- Modify: `apps/cms/src/app/(frontend)/site.css:3079-3100` (the S9 block and its print rule)
- Create: `apps/cms/e2e/productsGroupsHarness.ts` (pattern: `apps/cms/e2e/sportFilterHarness.ts`)
- Create: `apps/cms/e2e/productsGroups.spec.ts`
- Modify: `apps/cms/src/app/(frontend)/products/page.tsx:185-235`, moving the group `<section>`
  into `apps/cms/src/components/site/ProductGroup.tsx` so the page and the harness draw the SAME
  markup

**Interfaces:**
- Produces:
  `ProductGroup(props: { entry: Family; page: FamilyPage | null; products: ProductCard[]; soon: boolean; start: number }): JSX.Element`,
  with the types page.tsx already passes.

- [ ] **Step 1: Measure the three variants on the live page.** This is a throwaway script,
  `scratchpad/measure-products-deferral.mjs`. It loads puppeteer-core and chrome-launcher
  through Lighthouse's own install
  (`createRequire(createRequire('<repo>/package.json').resolve('lighthouse'))`).
  For each variant it injects the stylesheet with `page.evaluateOnNewDocument` (a `<style>`
  appended once `document.head` exists). It then runs `lighthouse(url, { port, output: 'json',
  onlyCategories: ['performance', 'accessibility'] }, undefined, page)` five times on
  `https://wear-run.com/products` with the default phone settings, and prints the median
  performance, total blocking time, largest paint and the `target-size` score.
  ```js
  const VARIANTS = {
    shipped: '',
    noDeferral: '.gallery-group + .gallery-group { content-visibility: visible !important; }',
    galleryDeferral:
      '.gallery-group + .gallery-group { content-visibility: visible !important; } .card-gallery { content-visibility: auto; }',
  }
  ```
  **Choose A1 (noDeferral)** if its median performance is within 0.02 of `shipped` and
  `target-size` is 1. Otherwise **A2 (galleryDeferral)** on the same test. If neither passes,
  stop and report to the owner.
- [ ] **Step 2: Write the failing guard.** Move the group markup into `ProductGroup.tsx` (a move,
  no change in output; `page.tsx` maps groups to `<ProductGroup …/>`). The harness bundles three
  `ProductGroup`s with the real stylesheets, the way `sportFilterHarness.ts` does:
  - Sportswear with 4 cards;
  - Teamwear with the 19 `LIVE_TEAMWEAR` garments;
  - Casual Wear with 7 cards.

  The spec:
  ```ts
  /**
   * ⚠️ NO GROUP MAY SPILL OVER THE NEXT BEFORE IT IS SCROLLED TO (11 Oct 2026). Polish S9 stood each
   * undrawn group in at 1,200px; Teamwear is 3,446px on a 412px phone, so its cards lay on top of the
   * next group's and Lighthouse's touch-target audit failed /products on every live run from 5 to 11
   * October. CI's database holds no Teamwear garment, so only this harness can see it.
   */
  test('no family group spills over the next before it is scrolled to', async ({ page }) => {
    for (const [width, height] of [[412, 823], [390, 844], [768, 1024], [1440, 900]] as const) {
      await page.setViewportSize({ width, height })
      await page.goto('/__products-groups')
      const spills = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.gallery-group')].flatMap((group) => {
          const box = group.getBoundingClientRect()
          const last = [...group.querySelectorAll('li.product-card')].at(-1)?.getBoundingClientRect()
          return last && last.bottom > box.bottom + 0.5
            ? [`${group.id}: its cards end ${Math.round(last.bottom - box.bottom)}px below the group`]
            : []
        }),
      )
      expect(await page.evaluate(() => scrollY), 'measured unscrolled').toBe(0)
      expect(spills, `${width}x${height}`).toEqual([])
    }
  })
  ```
- [ ] **Step 3: Run it and watch it fail** (`CI=1` so `prepare.mjs` rebuilds):
  `CI=1 npx playwright test e2e/productsGroups.spec.ts --project chromium`, run from `apps/cms/`.
  Expected: FAIL at 412x823, "teamwear-uniforms: its cards end ≈2246px below the group".
- [ ] **Step 4: Apply the variant Step 1 chose.** A1 replaces lines 3079-3100 with:
  ```css
  /*
   * ⚠️ EVERY GROUP IS DRAWN, ON PURPOSE (11 Oct 2026). Polish S9 (5 Oct) skipped drawing each group
   * after the first until it neared the screen and stood it in at 1,200px. On a 412px phone Teamwear
   * is 3,446px, so an undrawn group's cards spilled 2,246px past its stand-in onto the next group's:
   * Lighthouse's touch-target audit, which measures the page unscrolled, failed /products in every
   * live run from 5 to 11 October, and a phone's page grew 2,246px as Teamwear was drawn. Drawing
   * all of it cost <Step 1's measured difference> on Lighthouse's phone.
   * `e2e/productsGroups.spec.ts` holds it.
   */
  .gallery-group + .gallery-group {
    margin-block-start: 64px;
  }
  ```
  Write Step 1's numbers into that comment. A2 keeps the margin and adds:
  ```css
  /* Each card's picture gallery is drawn only as it nears the screen. It is absolutely placed in a
     fixed box (`.card-gallery`, inset), so skipping it can never move anything: the 11 Oct 2026
     fix for the stand-in that did (see above). */
  .card-gallery {
    content-visibility: auto;
  }

  @media print {
    .card-gallery {
      content-visibility: visible;
    }
  }
  ```
- [ ] **Step 5: Run the guard and its neighbours in all three engines.** Run `CI=1 npx playwright
  test e2e/productsGroups.spec.ts e2e/oneListPerFamily.spec.ts e2e/productsGrid.spec.ts
  e2e/sportFilter.spec.ts e2e/familyTickets.spec.ts`. Expected: all pass.
- [ ] **Step 6: Run the negative control both ways.** Put the 1,200px rule back, see Step 3's
  failure, and remove it again.
- [ ] **Step 7: Commit** ("Products page — draw every family group, so none lies on the next one
  before it is scrolled to"), with the measured numbers in the message.

### Task 2: The Firefox layout test records its own evidence and measures the settled page

**Files:**
- Modify: `apps/viewer/e2e/motion-and-layout.spec.ts:155-170` (`contactOnScreen`), plus the two
  D8 tests at `:3150` and `:3194`

- [ ] **Step 1: Make the helper report what it saw.** Add an `evidence` string:
  ```ts
  const controls = [...document.querySelectorAll('.contact-rail a, .action-bar a, .stage__contact a')]
  const describe = (a: Element) => {
    const r = a.getBoundingClientRect()
    const cs = getComputedStyle(a)
    return `${a.getAttribute('href')?.split(':')[0]} ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.bottom)} ${cs.display}/${cs.visibility}`
  }
  // …returned beside listed/email/whatsapp:
  evidence: `scrollY=${scrollY} innerHeight=${innerHeight} fonts=${document.fonts.status} [${controls.map(describe).join('; ')}]`,
  ```
  Both D8 tests then push `${at}: no email control on screen (${seen.evidence})`, and the same
  for WhatsApp.
- [ ] **Step 2: Measure the settled page.** After the heading is visible, both tests wait the way
  the sibling at `:3561` does:
  ```ts
  // Measure the settled page: fonts in, then two frames for the layout's own writes (the sibling
  // test at "the pinned bars never cover content" measured a fallback-font difference this way).
  await page.evaluate(() =>
    document.fonts.ready.then(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    ),
  )
  ```
- [ ] **Step 3: Prove the evidence appears.** Temporarily change `email:` to look for `mailto-x`,
  run the 3194 test once and see the evidence in the message, then revert.
- [ ] **Step 4: Run it 100 times under load.** `--project viewer-firefox --repeat-each=100
  --workers=12`. Expected: 100 passed. **Today's 0 of 90 means this cannot prove a fix.** What
  this task guarantees is that the next failure names its cause, in CI too (where the retry
  keeps the first attempt's error in the report).
- [ ] **Step 5: Run all four engines once.** Then commit ("Viewer layout test — measure the
  settled page, and say what was on screen when Email or WhatsApp is missing").

### Task 3: Out-of-date text

**Files:**
- Modify: `docs/README.md:195`, `apps/cms/src/securityTxtRoute.test.ts:10`, `SECURITY.md:51-56,61-66,120-135`

- [ ] **Step 1:** `docs/README.md:195` becomes: `| [DECISIONS-BETA-WEBSITE.md](DECISIONS-BETA-WEBSITE.md) | Every decision about the public website, numbered from D1 and dated — read this before "fixing" anything that looks odd |`
- [ ] **Step 2:** `securityTxtRoute.test.ts:10` becomes "…registers a dot-folder route
  (`○ /.well-known/security.txt`, prerendered byte-identical)." The byte count goes: it changes
  whenever the text does (613, then 616 on 11 Oct), and the test above already proves the bytes
  are the shared text's.
- [ ] **Step 3:** SECURITY.md scope becomes:
  ```markdown
  - `wear-run.com` — the website, including every garment's 3D page under `/products/`
  - `cms.wear-run.help` — the Payload admin and the public read-only API
  - `media.wear-run.com` and `media.wear-run.help` — the R2 media domains
  - `wear-run.help` and `viewer.wear-run.help` — old addresses that forward to `wear-run.com`
    (printed QR tags still carry them)
  - Anything in this repository: the Workers, the shrink container, the asset
    pipeline, and the CI/CD workflows
  ```
  Line 66 becomes "The site itself is `wear-run.com`; printed QR tags use `viewer.wear-run.help`,
  which forwards there." The personal-data section's first paragraph (lines 122-125) becomes:
  ```markdown
  What the website and the garment pages collect, why, and for how long is set out in the privacy
  notice, [wear-run.com/privacy](https://wear-run.com/privacy), which is kept current, so this file
  does not repeat it. The CMS also holds the staff accounts (email + password hash).
  ```
  Line 135's link becomes `[wear-run.com/privacy](https://wear-run.com/privacy)`.
- [ ] **Step 4: Check the docs.** Run `node scripts/doc-citations.mjs` (0 unresolved),
  `node scripts/check-docs-index.mjs` and
  `npx --yes pnpm@12.6.0 --filter @run-apparel/cms exec vitest run src/claudeMd.test.ts src/securityTxtRoute.test.ts`.
- [ ] **Step 5: Commit** ("Docs — SECURITY.md names today's addresses and points to the privacy
  notice; two stale counts go").

### Task 4: What the garment pages tell crawlers (owner's option)

**Files:**
- Modify: `apps/viewer/worker/preview.ts` (`buildProductJsonLd` at :470 and the caller at :261),
  `apps/viewer/worker/index.ts:255-266`, `apps/viewer/worker/preview.test.ts` (:736-767 and the
  `buildProductJsonLd` tests), `docs/DECISIONS-BETA-WEBSITE.md` (new D38) and `docs/RUNBOOK.md:2510`

**Option A (recommended):**
- [ ] **Step 1: Write the failing test** in `preview.test.ts`. It says that the crawler HTML of a
  garment page carries a BreadcrumbList and no `"@type":"Product"`, `"ProductGroup"` or
  `"Offer"`. The no-price test (:754) is kept and pointed at the whole document.
- [ ] **Step 2: Run it and watch it fail:**
  `npx --yes pnpm@12.6.0 --filter @run-apparel/viewer exec vitest run worker/preview.test.ts`
  Expected: FAIL, "ProductGroup" found.
- [ ] **Step 3: Implement.** Drop `jsonLd` from the preview object and the product `<script>` from
  `index.ts`, and delete `buildProductJsonLd` with its tests (the fabric, colours and 3D file stay
  in the robot copy's words). Keep `buildBreadcrumbJsonLd`. Put a comment where the block was:
  ```ts
  /*
   * ⚠️ NO PRODUCT LABEL, ON PURPOSE (D38, owner 2026-10-11). Google uses Product markup only to show
   * a price or a rating, and needs one of them; these garments are quoted per order (D10), so the
   * label earned nothing and Search Console reported 2 errors and 7 warnings on every garment
   * (rxps/wine, crawled 2026-09-30). The breadcrumbs below stay.
   */
  ```
- [ ] **Step 4: Run it and watch it pass**, together with the whole viewer unit suite.
- [ ] **Step 5: Paste the new crawler output into Google's Rich Results Test (Code tab).**
  Expected: Breadcrumbs valid, and no Product snippets or Merchant listings item. Record the
  result in D38.
- [ ] **Step 6: Write D38** in DECISIONS-BETA-WEBSITE.md ("Garment pages carry no product label —
  amends D10": decision, reasons with the numbers above, guard). Add "Amended by D38" to D10 and
  rewrite RUNBOOK:2510.
- [ ] **Step 7: Commit** ("Garment pages — no product label for crawlers, since without a price it
  earned only Search Console errors (D38)").

**Option B:** same steps, except that only `variant.offers` (`preview.ts:540-551`) goes. The test
at :736 becomes "carries no offer", the no-price test stays, and D38 says the offer went and the
group stayed. Rich Results Test expected: Product snippets "Either offers, review or
aggregateRating should be specified", and no merchant listing.

**Option C:** no code. D10 stands and RUNBOOK:2510 already explains it.

### Task 5: Gates, backup, pull request

- [ ] `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`,
  `bash scripts/test-alert-shell.sh`, `node scripts/check-docs-index.mjs`,
  `pnpm seed:assets && pnpm build`, `node scripts/check-bundle-budget.mjs`, both e2e suites
  (`--grep`-free full runs, one at a time).
- [ ] D1 backup (`node scripts/backup-d1.mjs` + `verify-backup.mjs`), and a `rxps/wine` capture.
  The API payload does not carry the crawler's markup, so the after-diff should be EMPTY.
- [ ] Push once, open the PR (with the plan's findings), turn on Auto-fix, and wait for green.
  The owner merges.

### Task 6: After the deploy

- [ ] The deploy run's `conclusion` is success, and the rxps/wine diff is empty.
- [ ] Lighthouse live (it runs by itself after the deploy) reports `products.mobile` target-size
  passing and every performance floor held. If it fails on performance, report the numbers;
  don't loosen a floor.
- [ ] The crawler HTML of `/products/rxps/wine` (Googlebot user-agent) shows Option A/B's markup
  and still carries the BreadcrumbList.
- [ ] The owner (or Claude in the built-in browser, if Search Console is signed in there) presses
  "Validate fix" on the Merchant listings and Product snippets reports.
- [ ] Delete the local branch (`git branch -d fix/site-health-2026-10-11` after `git switch
  main && git merge --ff-only origin/main`). Only `main` stays.
- [ ] Update the memory notes.
