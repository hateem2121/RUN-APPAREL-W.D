---
paths:
  - "apps/cms/src/app/(frontend)/**"
  - "apps/cms/src/app/not-found.tsx"
  - "apps/cms/src/components/site/**"
  - "apps/cms/e2e/**"
  - "apps/cms/playwright.config.ts"
---

# The public website: its look, its footer and its browser tests

Moved from `apps/cms/CLAUDE.md` on 2026-09-26, word for word, so it loads only when you open
the files it governs (`docs/CLAUDE-MD-MAINTENANCE.md` explains the mechanism).

## The site's look is the shared design system

Build the public site's UI from `packages/ui/src/tokens.css` and `packages/ui/src/base.css`,
the same "Paper & Ink" system the viewer ships (`docs/DESIGN.md` is its prose index; the CSS
wins if they disagree). Site-only layout lives in `apps/cms/src/app/(frontend)/site.css`,
which `apps/viewer/src/styles/tokens.test.ts` scans. Use only the colours, type, spacing and
durations those files define. No Tailwind, shadcn/ui or MUI; behaviour a screen needs
(dialogs, popovers, menus) comes from `base-ui`, which ships no CSS
(`docs/DECISION-UI-LIBRARIES.md`). The paper ground, the one italic serif word per headline
and the mono labels ARE the brand, so an instruction to "avoid a generic AI look" must not
remove them.

## The scripted pieces: complete without them (2026-09-29)

The count-up, live 3D, form helper (error lines and the list of mistakes, since the
form became one step on 2026-10-01), phone code, file picker and globe are client islands over
server markup that is already the whole page: the final figure, the poster, a link to the large
photo, one form with every field and one Send, the address with a directions link. Each starts from that state and enhances only after it mounts, and does nothing when the visitor asks
for reduced motion, or under `navigator.webdriver` unless a test lifts the flag. One
motion duration is new, `--showpiece` (D26). Inquiry files go to the PRIVATE R2 bucket
`run-apparel-inquiry-files` through `inquiry-files` (`collections/InquiryFiles.ts`), checked
byte by byte first (`lib/inquiryFiles.ts`). Never give that storage a `generateFileURL` or
`disablePayloadAccessControl`; `Media` has both on purpose, and copying them publishes buyers'
files.

## Browser tests for the public site

`pnpm --filter @run-apparel/cms test:e2e` — Chromium, Firefox and WebKit (608 tests listed on
2026-09-24), added 2026-09-05 because nothing loaded `/`, `/products` or `/contact` in a browser and three blank pages
would have passed every gate. Runs in CI on two of the five **`e2e-shard`** machines (since
2026-09-29; a step inside the single `e2e` job before that), each seeding its own database.
It is still gated through the one `e2e` check: that job passes only when every shard did,
so neither `deploy.needs` nor the required-checks list changed — `.github/CLAUDE.md`
records that splitting those silently stops a red gate blocking.

🟡 **`e2e/prepare.mjs` SKIPS THE REBUILD LOCALLY**, so a source edit does not reach
`next start` and a negative control passes without testing anything. Use `CI=1` when
breaking something on purpose.

🟢 The port is owned by `playwright.config.ts` (4174) and `e2e/serve.mjs` THROWS if it is
unset.

🟢 **FIREFOX RUNS WITH `Cross-Origin-Opener-Policy` SWITCHED OFF, ON PURPOSE (2026-09-18).**
Every page sends that header, and it makes Playwright's Firefox driver lose a navigation
(microsoft/playwright#42731): `page.goto` times out waiting for "load" on a page that has
finished loading. That hit 25 of 40 CI runs; the retry hid it until PR #17 failed on it.
`e2e/firefoxPrefs.mjs` has the mechanism and the numbers, and `src/firefoxPrefs.test.ts`
pins it. Keep it until `node e2e/firefox-coop-hang.mjs --prefs=none` shows 0 stuck on a
newer Playwright.

🟡 **`next start` NEVER RUNS `worker.mjs`, THE SCRIPT GUARD (SE-04, 2026-09-18).** This suite
therefore tests the fallback policy (`PUBLIC_PAGE_CSP`, still with `'unsafe-inline'`) and never
the nonce. To see the guard:
1. Run `opennextjs-cloudflare build`.
2. Put a throwaway `PAYLOAD_SECRET` in a `.dev.vars` (gitignored). In a fresh worktree, apply
   the migrations to its local D1 first (`PAYLOAD_SECRET=<throwaway> pnpm --filter
   @run-apparel/cms migrate`). Without them every page logs "no such table", and the preview
   exited after 2–3 minutes twice (2026-10-04).
3. Start `cms-edge` from `.claude/launch.json`, which runs `opennextjs-cloudflare preview
   --local-upstream wear-run.com --port 4174`. 🟡 Not `wear-run.help`: since the domain move
   that host only 308s to wear-run.com, so a preview pinned to it serves no page.
4. Run `node e2e/csp-nonce-edge.mjs --origin=http://localhost:4174`: 3 engines × 6 page types.

After a deploy, run it with `--origin=https://wear-run.com`. 🟡 A control that skips the nonce
on an EXTERNAL script proves nothing: `'self'` still admits it, correctly. Only a missing nonce
on an INLINE script breaks a page, so plant the fault there. 🟡 A local `curl` without
`--compressed` counts ZERO scripts: the local runtime gzips a page the way Cloudflare's edge
does, AFTER the guard (measured 2026-09-22). OpenNext hands the guard plain text.

🟡 **CI's `e2e` job has NO `PAYLOAD_SECRET`, and local runs always do** (`.env`). So a
"passes locally" run proves nothing about the CI step: measured 2026-09-06 with `.env`
moved aside, Payload never initialised, `/admin` and `/api/*` answered 500, and four tests
failed while every page test stayed green. `e2e/serve.mjs` now supplies a throwaway
secret when the environment has none. To reproduce CI here, move `.env` and `.dev.vars`
aside and run with `CI=1`. And `/api/media` answers **403** to anonymous requests since
main narrowed `Media.read` — the catch-all test expects that, not 200.

## The public site footer

Built 2026-09-05 from an approved design — `docs/superpowers/specs/2026-09-05-site-footer-quiet-room-design.md`.

🟡 **The garment pages draw this footer too since 2026-10-02 (visual audit VA-31).** Its rules
are `packages/ui/src/footer.css` (not site.css), and the tab, question and clock that only the
website draws are in `packages/ui/src/footer-prompt.css`, which only the website imports (polish
D1: the garment pages' first paint pays for every byte they load); its words, links and rules are
`packages/shared/src/siteFooter.ts`, and both browser suites hold it to `siteFooterAriaSnapshot`
— so a block added or moved in `SiteFooter.tsx` must move in `apps/viewer/src/components/Footer.tsx`
in the same change, or both suites fail. One deliberate difference since polish Q42 (owner,
2026-10-04): the garment pages leave out the tab, the question and its clock, because they end on
their own "Ask about this garment" (`siteFooterAriaSnapshot(…, { prompt: false })`,
`.site-footer--no-prompt`).

Four things that bit while building it:

- **The CTA tab sits ON the slab's top edge, OUTSIDE the clipped box.** `<footer>` is
  unclipped; the inner slab carries `overflow: hidden` for the cropped wordmark. Put the
  tab inside the clipped element and it is invisible — the first draft did, and the fillets
  curved into an edge that was already behind them.
- **The wordmark is fitted by measuring the rendered text**, after `document.fonts.ready`.
  Two fixed sizes both ran the name off the edge; the name is a CMS field, so its length is
  an input. `packages/shared/src/wordmarkFit.ts` (shared since 2026-10-02, below).
- **🟡 The cursor honours `navigator.webdriver`** (as the viewer's does), so Playwright never
  sees it unless the test lifts the flag with `addInitScript`. `apps/cms/e2e/footer.spec.ts`
  does, and also asserts the honest default — absent under automation.
- **🟡 The footer's light is positioned from the cursor ring's TRAILED point** (`packages/shared/src/cursorBus.ts`),
  never the raw pointer, and its linger (300ms since 2026-10-05, 180ms before; counted from the
  first frame seen off content, not the last seen on it) needs its own timer tick: the bus
  publishes only while the ring moves, so without one a hand-off caught inside the window stayed
  lit over empty ground for good. The browser suite found that on its first run. Why 300 and why
  that start: the comments in `apps/cms/src/components/site/FooterGlow.tsx`.

🟡 Two gates to know about here: `navbar.spec.ts` measures EVERY link on every page against
the 44px touch floor (the first footer shipped 16px rows — real 44px rows, never a
padding/negative-margin trick, which overlaps neighbours and hides the miss); and
`publicSite.test.ts` forbids `data-open` anywhere in the site's CSS, so the clock's light
is `data-state`. The seven claim fields (`capacity.*`, `worksCoordinates`, `certifications`,
`socialLinks`) carry **no defaults on purpose**; `projectFooter()` renders nothing for a
blank claim. `vitest.config.ts` compiles JSX through **oxc** — Vite 8 ignores the `esbuild`
option when both are set, and the first attempt changed nothing.
