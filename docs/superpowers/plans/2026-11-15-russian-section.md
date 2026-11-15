# Russian Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every code-held public page of wear-run.com gets a Russian twin under `/ru`, with
`lang="ru"`, `hreflang` pairs, Cyrillic brand-matched fonts, and facts identical to English.

**Architecture:** A third root route group `app/(ru)` with its own layout (`<html lang="ru">`) and
ONE small route file per Russian page (`app/(ru)/ru/<English path>/page.tsx`), each rendering the
SAME component its English twin renders, fed Russian data (`*.ru.ts` twins typed with the English
types) and a `locale` prop for component-held words.

> **Changed during Task 2 (2026-11-15):** the plan first said one catch-all route plus a registry.
> `apps/cms/siteHostRules.mjs` records that a catch-all calling `notFound()` was deleted on
> 2026-09-07 because `notFound()` does not server-render its page. With one file per page, an
> unknown `/ru/…` matches no route and the root not-found answers, server-rendered. A test checks
> that every entry of `RU_PAGE_SOURCES` has its folder, and no folder lacks an entry.

**Tech Stack:** Next.js app router on OpenNext/Cloudflare, Payload 3, Vitest, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-11-15-russian-section-design.md`

## Global Constraints

- English pages: zero visible change except the header/footer language link «Русский».
- Russian path = `/ru` + English path; `/ru` is the Russian home.
- `hreflang`: `en`, `ru`, `x-default` (→ English). Open Graph locale `ru_RU` on Russian pages.
- Fonts: Roboto Flex (headings/body) and Cormorant italic (accent), self-hosted woff2, Cyrillic
  `unicode-range` only, declared under the existing family names `"Archivo Variable"` and
  `"Instrument Serif"`.
- Journal posts and case studies: no Russian twin; Russian hubs list them with «на английском».
- No payment, delivery or Russia-specific claims in Russian text.
- Every number in an English string appears in its Russian twin.
- Same contact form; hidden field `lang=ru`; inquiry email gains "Language: Russian (/ru/contact)".
- Shared `packages/shared/src/siteFooter.ts` and everything in `apps/viewer` stay unchanged.
- Commands use `npx --yes pnpm@12.15.0`. American-English rules apply to English only.

## Review Focus

1. `/ru/<unknown>` must answer 404 with a visible Russian page, scripting off (root not-found).
2. A Russian contact submission with an error must land back on `/ru/contact`, not `/contact`.
3. An English page must not request either new font file (English byte-identical).
4. A Russian page with a Latin product name inside a Cyrillic heading must draw both faces correctly
   (mixed-script line, e.g. «Форма X-MILO PRO»).
5. `/ru/products?family=<slug>` must filter exactly like `/products?family=<slug>`.

---

### Task 1: Locale helpers and metadata

**Files:**
- Create: `apps/cms/src/lib/locale.ts`, `apps/cms/src/lib/locale.test.ts`
- Modify: `apps/cms/src/lib/seo.ts` (`buildMetadata`)
- Test: `apps/cms/src/lib/seo.test.ts` (extend)

**Interfaces:**
- Produces: `type Locale = 'en' | 'ru'`; `ruPath(enPath: string): string` (`'/'`→`'/ru'`);
  `enPathOf(ruPath: string): string`; `hasRussianTwin(enPath: string): boolean` (false for
  `/journal/:slug`, `/case-studies/:slug`); `buildMetadata({ title, description, path, locale? })`
  where `path` is always the ENGLISH path and `locale` defaults to `'en'`.

- [ ] **Step 1:** Tests: `ruPath('/')==='/ru'`, `ruPath('/guides/aql-inspection')==='/ru/guides/aql-inspection'`, round trip with `enPathOf`; `buildMetadata({…, path:'/contact', locale:'ru'})` has canonical `https://wear-run.com/ru/contact`, `alternates.languages` = `{ en: …/contact, ru: …/ru/contact, 'x-default': …/contact }`, `openGraph.locale==='ru_RU'`; the English call gains the same `languages` and keeps `en_US`; a path with no twin gets no `languages`.
- [ ] **Step 2:** Run `npx --yes pnpm@12.15.0 --filter @run-apparel/cms exec vitest run src/lib/locale.test.ts src/lib/seo.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Share images: Russian pages reuse the English path's image.
- [ ] **Step 4:** Same command → PASS. Commit "Russian section — locale helpers and hreflang in page metadata".

### Task 2: Every list of public paths knows the twins

**Files:**
- Modify: `apps/cms/publicViewerHeaders.mjs` (export `RU_PAGE_SOURCES`, append to `PUBLIC_PAGE_SOURCES`), `apps/cms/siteHostRules.mjs` (`CMS_PUBLIC_PATHS`), `scripts/indexnow-paths.mjs`, `scripts/public-security-probe.mjs`, `apps/cms/src/lib/searchVisibility.ts` (`sitemapFor` emits `/ru` entries with `alternates.languages`)
- Test: the existing tests of each (`src/publicSite.test.ts`, `src/indexnowPaths.test.ts`, `src/publicSecurityProbe.test.ts`, `src/lib/searchVisibility.test.ts`)

**Interfaces:**
- Consumes: `ruPath`, `hasRussianTwin` (Task 1; the `.mjs` files carry a local copy of `ruPath` with a test pinning both equal).
- Produces: `RU_PAGE_SOURCES: readonly string[]` = `['/ru', ...PUBLIC_PAGE_SOURCES.filter(hasTwin).map(ruPath)]` plus `/ru/journal`, `/ru/case-studies`.

- [ ] **Step 1:** Tests: `RU_PAGE_SOURCES` contains `/ru/custom-teamwear-manufacturer`, `/ru/guides/aql-inspection`, `/ru/journal`; NOT `/ru/journal/:slug`; every entry gets the same CSP headers as its English twin; sitemap for visibility "visible" lists `https://wear-run.com/ru/contact` with `alternates.languages.en`; sitemap for "hidden" lists neither language.
- [ ] **Step 2:** Run the four test files → FAIL. **Step 3:** implement. **Step 4:** PASS. Commit "Russian section — security headers, sitemap, IndexNow and probe list the /ru pages".

### Task 3: Cyrillic fonts

**Files:**
- Create: `packages/ui/fonts/roboto-flex-cyrillic-wdth-100-125.woff2`, `packages/ui/fonts/cormorant-italic-500-cyrillic.woff2` (as built; the names first planned were `roboto-flex-cyrillic`/`cormorant-italic-cyrillic`) (from `@fontsource-variable/roboto-flex` and `@fontsource/cormorant`, cyrillic subset; score both with Socket `depscore` before adding as devDependencies, or download the woff2 once and commit it), `packages/ui/src/cyrillic.css`
- Modify: `apps/cms/src/app/(ru)/layout.tsx` imports it (Task 4); nothing in `(frontend)` imports it
- Test: `apps/cms/e2e/russian.spec.ts` (created here, extended later)

**Interfaces:** `@font-face { font-family: "Archivo Variable"; src: roboto-flex…; font-stretch: 25% 151%; font-weight: 100 1000; unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }` and the same range for `"Instrument Serif"` italic → Cormorant, with `size-adjust` measured so Cyrillic x-height matches Instrument Serif's (record the measured value in a comment).

- [ ] **Step 1:** e2e test: on `/ru/custom-teamwear-manufacturer` `document.fonts` has a loaded face whose source contains `roboto-flex-cyrillic`; the h1's computed `font-stretch` is `122%`; on `/custom-teamwear-manufacturer` NO request URL contains `cyrillic` (Review Focus 3); mixed line «X-MILO PRO» inside a Russian heading has no layout overflow (Review Focus 4).
- [ ] **Step 2–4:** fail → implement → pass (`npx --yes pnpm@12.15.0 --filter @run-apparel/cms exec playwright test e2e/russian.spec.ts`). Check `node scripts/check-bundle-budget.mjs` still passes. Commit "Russian section — Roboto Flex and Cormorant draw Cyrillic, loaded only by Russian pages".

### Task 4: The Russian root layout, chrome and 404

**Files:**
- Create: `apps/cms/src/app/(ru)/layout.tsx`, one `page.tsx` per Russian page under `apps/cms/src/app/(ru)/ru/`, `apps/cms/src/lib/i18n/chrome.ts` (EN and RU strings: skip link, nav, footer labels the website draws itself, cookie banner, language link, 404 words) (as built: no registry file; each Russian page is its own route file that draws the English page's component with `locale="ru"`)
- Modify: `apps/cms/src/app/(frontend)/layout.tsx` (pass `locale="en"`), `apps/cms/src/components/site/SiteHeader.tsx`, `SiteFooter.tsx`, `ConsentBanner.tsx` (take `locale`, read words from `chrome.ts`, English output byte-identical), `apps/cms/src/app/not-found.tsx` (language from the request path)
- Test: `apps/cms/src/lib/i18n/chrome.test.ts`, `apps/cms/e2e/russian.spec.ts`

**Interfaces:**
- Produces: `CHROME: Record<Locale, ChromeWords>`; `type RuPage = { title: string; description: string; render(props: { searchParams: Record<string, string | string[] | undefined> }): Promise<React.ReactElement> }`; each Russian page file exports `metadata = buildMetadata({ …, path: <English path>, locale: 'ru' })` and renders the English page's component with Russian data and `locale="ru"`.

- [ ] **Step 1:** Tests: `CHROME.ru` has every key of `CHROME.en`; e2e `/ru` has `html[lang=ru]`, a link «English» to `/`, and `/` has «Русский» to `/ru`; `/ru/nope` answers 404 with Russian words with JavaScript disabled (Review Focus 1); Russian pages' page-level JSON-LD carries `inLanguage: "ru"` (the Organization node unchanged); every `/ru` page has no horizontal scroll at 375 px and joins `navbar.spec.ts`'s page list for the 44 px touch floor; the existing `footer.spec.ts`, `navbar.spec.ts` and the viewer's footer specs pass unchanged.
- [ ] **Step 2–4:** fail → implement → pass. Commit "Russian section — Russian layout, header, footer, cookie banner and 404".

### Task 5: Buyer pages and home

**Files:**
- Create: `apps/cms/src/lib/familyPages.ru.ts` (`FAMILY_PAGES_RU: readonly FamilyPage[]`), the home words (as built: `apps/cms/src/lib/pageDescriptions.ru.ts`, `apps/cms/src/lib/aboutCopy.ru.ts` and the Russian beside the English in `apps/cms/src/components/site/HomePage.tsx`), `apps/cms/src/lib/garmentTypes.ru.ts` (`GARMENT_TYPE_RU: Record<string, string>`, all 40 English types)
- Modify: `apps/cms/src/components/site/FamilyLanding.tsx`, `HomeHero.tsx` and the home page's components (take `locale`)
- Test: `apps/cms/src/ruParity.test.ts` (created here, extended by Tasks 6–8)

**Interfaces:**
- Produces in `ruParity.test.ts`: `sameShape(en, ru)` — same keys, same array lengths, identical `path`/`href`/`slug`/`familySlug` values, and every digit run in an English string present in the matching Russian string.

- [ ] **Step 1:** Tests: `sameShape(FAMILY_PAGES, FAMILY_PAGES_RU)`; every English garment type in the live seed has a key in `GARMENT_TYPE_RU`; every Russian string contains Cyrillic unless allowlisted (product names).
- [ ] **Step 2–4:** fail → write the Russian (Russian B2B register; address the buyer as lower-case «вы», modern business style; no calques) → pass. Commit "Russian section — the home page and six buyer pages in Russian".

### Task 6: Products gallery and contact

**Files:**
- Modify: `apps/cms/src/app/(frontend)/products/page.tsx` and `contact/page.tsx` components (take `locale`), `apps/cms/src/app/(frontend)/contact/submit/route.ts` (read `lang`; redirect to `ruPath('/contact')` when `ru`), the inquiry email builder `apps/cms/src/lib/inquiryEmailHtml.ts` (line "Language: Russian (/ru/contact)"), Turnstile render option `language: 'ru'`
- Test: the submit route's tests, `apps/cms/e2e/russian.spec.ts`

- [ ] **Step 1:** Tests: posting with `lang=ru` and a missing field redirects to `/ru/contact?…#inquiry-problem` (Review Focus 2); without `lang` behaves exactly as today; `/ru/products?family=teamwear-uniforms` shows the same cards as `/products?family=teamwear-uniforms` (Review Focus 5). Local form posts only to `localhost:4174` (the guard hook blocks the live form).
- [ ] **Step 2–4:** fail → implement → pass. Commit "Russian section — Russian product gallery and contact page".

### Task 7: The 31 guides and the guide hub

**Files:**
- Create: `apps/cms/src/lib/guides.ru.ts` (`GUIDES_RU: readonly Guide[]`, `GUIDES_INDEX_RU`), `apps/cms/src/lib/guideLibrary.ru.ts` (`LIBRARY_GUIDES_RU`)
- Modify: `apps/cms/src/components/site/GuidePage.tsx`, `GuideCard.tsx`, `GuideTools.tsx` (component words via `locale`)
- Test: `ruParity.test.ts`

- [ ] **Step 1:** Tests: `sameShape` for every guide pair (ordered by `path`); sources and their URLs identical; `legalLine` has a Russian twin.
- [ ] **Step 2–4:** fail → translate (two helpers may each take half the guides, each in its own worktree, data files only) → pass. Commit per batch "Russian section — guides N–M in Russian".

### Task 8: FAQ, glossary, company pages, policies, privacy, terms, careers, press, community, factory, journal and case-study hubs

**Files:** Russian twins of `apps/cms/src/lib/faqs.ts`, `policies.ts`, `aboutPages.ts`, `companyFacts.ts` and the glossary data; the privacy and terms pages' text; components take `locale`; one route file per page. Journal and case-study hubs render the English posts with «на английском».
- [ ] **Step 1:** `sameShape` for each pair; `/ru/journal` lists the same post links as `/journal`.
- [ ] **Step 2–4:** fail → translate → pass. Commit "Russian section — the remaining pages in Russian".

### Task 9: The outside checks and the gate

**Files:**
- Create: `scripts/check-russian-text.mjs`, `scripts/russian-text-allowlist.json`
- Test: `scripts/check-russian-text.test.mjs` (node:test, parser only, no network)

**Interfaces:** `node scripts/check-russian-text.mjs` imports every `*.ru.ts` and `chrome.ts` (Node strips types), collects Cyrillic strings, sends them to Yandex Speller (`https://speller.yandex.net/services/spellservice.json/checkTexts`, lang `ru`) and LanguageTool (`https://api.languagetool.org/v2/check`, `language=ru-RU`), respecting their free limits; prints each flag with file and string; exits 1 on any flag not in the allowlist (each allowlist entry carries a reason).

- [ ] **Step 1:** parser test: extracts Cyrillic strings from a fixture, ignores Latin-only ones; a planted misspelling «образеца» is flagged (negative control, network run).
- [ ] **Step 2:** Run it; fix the text until exit 0; record counts.
- [ ] **Step 3:** Reviewer helper (briefed as a senior Russian B2B copywriter, own worktree, "Do not start any sub-agents") reads every Russian string; apply its fixes; re-run Step 2.
- [ ] **Step 4:** `node .claude/skills/gates/run-gates.mjs` → all green (bundle budget, CMS Worker size, every suite). Commit "Russian section — spelling and grammar checks pass".

### Task 10: Pull request

- [ ] D1 backup not needed (no migration); capture `GET /api/public/viewer/rxps/wine` before-copy into `backups/`.
- [ ] Push once; open the PR (draft until the owner approves), Auto-fix and auto-merge per the owner's standing rule; judge CI by `conclusion`.
- [ ] After merge: Yandex Webmaster reindex for `/ru` + six buyer pages + `/ru/guides` + `/ru/contact`; pass = Russian pages under "Searchable pages" within 14 days.
