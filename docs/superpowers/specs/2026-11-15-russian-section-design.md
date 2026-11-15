# Russian section of wear-run.com — design

Date: 2026-11-15. Owner: Hateem. Status: DRAFT, waiting for the owner's approval.

## Intent

Russian and CIS buyers search Yandex in Russian. The site is English only, so Yandex can index it
but ranks it for almost nothing a Russian buyer types. The owner wants the whole website readable in
Russian so that Russian-speaking brands, distributors and clubs find RUN APPAREL in Yandex and send
enquiries.

Evidence behind the decision (measured 2026-11-15):

- Yandex Webmaster: `https://wear-run.com` verified the same day (DNS TXT record on Cloudflare).
- Yandex Wordstat, 10 Sep – 9 Oct 2026, monthly searches: custom football kit 2,521; custom sports
  uniform 1,281; sportswear manufacturer 1,194; sports uniform sewing 941; contract clothing
  manufacturing 217; soccer balls wholesale 115; private-label clothing 55. Most of the large numbers
  are local Russian clubs; about 400 a month look like import buyers.
- Google Analytics: 0 sessions from Russia or the CIS since 30 Sep 2026 (consenting visitors only).
- Reachability: 14 of 15 Russian home-ISP probes (Globalping) and Yandex's own robot load the site.

This reverses the owner's 30 Sep 2026 decision "English only, no hreflang". The owner made the new
decision knowingly on 2026-11-15 after seeing the numbers above.

## Goals

1. Every public page of the website whose words live in code has a Russian twin at
   `/ru/<same path>` (journal posts and case studies excepted: see Owner decisions).
2. Yandex and Google understand the pair: `lang="ru"` on the Russian pages, `hreflang` links both
   ways plus `x-default`, and both languages in the sitemap.
3. The Russian reads as written by a Russian B2B marketer, not translated. The facts are identical
   to the English page: every number, minimum, lead time and product name.
4. The English site does not change in any way a visitor can see, apart from a language link.

## Non-goals

- The 3D garment pages (`/products/<product>/<colour>`, drawn by the viewer Worker,
  `apps/cms/viewerForward.mjs`) stay English. The Russian product gallery links to them. (Builder's
  call, recorded here: 205 pages in a second app, with words held in the database.)
- No Russian-only content: no payment, delivery or Russia-specific claims (owner, 2026-11-15:
  "say nothing; ask on enquiry").
- No Russian subdomain: every `wear-run.com` subdomain except `www.` and `media.` belongs to the
  owner's email-signature project (root `CLAUDE.md`).

## Anti-goals (a failure even if it works)

- Any change to an approved English page's words, layout or speed.
- A Russian page that states a different number from its English twin.
- Russian text that a Russian buyer recognises as machine translation.
- Russian headings drawn in a system font because the brand fonts lack Cyrillic (see Fonts).

## Constraints

- One pull request for everything; it goes live only when every page is translated and checked
  (owner, 2026-11-15).
- The Russian contact page uses the same form as English; submissions are stored where they are now
  (Cloudflare, outside Russia). The owner accepted the Russian personal-data law (152-FZ) risk on
  2026-11-15 after it was explained; this is not legal advice.
- Repository is public: nothing private goes into the Russian text that is not already public.
- Free tools only; no new paid service.
- The site's look is the shared "Paper & Ink" system (`packages/ui/src/tokens.css`,
  `packages/ui/src/base.css`); the brand rules in `.claude/rules/cms-site.md` apply unchanged.

## Approaches considered

| | How | Trade-off |
|---|---|---|
| **A. Separate `/ru/` section (CHOSEN by the owner)** | A second route group with its own root layout (`<html lang="ru">`). Russian words in twin data files beside the English ones; page components take the language as an input. | English pages barely change; no new dependency; more files. |
| B. Translation library (next-intl) | Every text becomes a key looked up per language. | New dependency; every English component rewritten, risking the approved English site. |
| C. Payload localization | Russian stored in the database, edited in the admin. | Most words live in code, not the CMS; every translated field needs a D1 migration. |

## The design

### Addresses and routing

- Russian page = `/ru` + the English path, same slug: `/ru/custom-teamwear-manufacturer`,
  `/ru/guides/aql-inspection`. Latin slugs keep the English↔Russian map one-to-one. (Builder's
  call; Cyrillic slugs were considered and dropped: percent-encoded in every link and log.)
- `/ru` is the Russian home page.
- A new route group beside `apps/cms/src/app/(frontend)` holds the Russian pages, with its own
  root layout identical to `apps/cms/src/app/(frontend)/layout.tsx` except `lang="ru"` and the
  Russian skip link, header, footer and cookie banner.
- Each Russian page file is a thin address like the English one
  (`apps/cms/src/app/(frontend)/custom-teamwear-manufacturer/page.tsx`): it picks the Russian data
  and renders the SAME component with `locale="ru"`.
- Every list of public paths gains the `/ru` twins: `PUBLIC_PAGE_SOURCES` in
  `apps/cms/publicViewerHeaders.mjs` (security headers and the script guard), the sitemap
  (`apps/cms/src/app/sitemap.ts`), IndexNow (`scripts/indexnow-paths.mjs`), the live security probe
  (`scripts/public-security-probe.mjs`). The tests that hold those lists together
  (`apps/cms/src/publicSite.test.ts` and friends) are extended, not loosened.

### Words

- Each English data file that holds page text gets a Russian twin of the same shape:
  `apps/cms/src/lib/familyPages.ts`, `apps/cms/src/lib/guides.ts`,
  `apps/cms/src/lib/guideLibrary.ts`, `apps/cms/src/lib/faqs.ts`, `apps/cms/src/lib/policies.ts`,
  `apps/cms/src/lib/aboutPages.ts`, the glossary, the privacy and terms pages, the home page, and
  the site chrome (header, footer words in `packages/shared/src/siteFooter.ts`, cookie banner,
  contact form labels, errors and the sent page, the 404).
- Text that lives in components (button labels, small headings) moves into a per-language strings
  object passed down with `locale`; the English strings stay byte-identical.
- Text that lives in the CMS database (journal posts, case studies, product names, home-page
  settings): see "Left to the owner" below.
- Guides keep their English sources and citations; Russian text cites the same works.

### Fonts

Archivo and Instrument Serif have no Cyrillic (Fontsource catalogue, read 2026-11-15:
`latin, latin-ext, vietnamese` and `latin, latin-ext`); IBM Plex Mono has. Plan: add a Cyrillic
companion face under the SAME family names with a Cyrillic `unicode-range`, so the browser fetches
it only when a page contains Cyrillic. English pages download nothing new and render identically.
The companion faces are an owner decision (below).

### Search signals

- `buildMetadata` (`apps/cms/src/lib/seo.ts`) gains `alternates.languages` (`en`, `ru`,
  `x-default` → English) on both twins; each Russian page's canonical is itself.
- The sitemap lists both languages with alternates.
- Organization JSON-LD stays one node; Russian pages declare `inLanguage: "ru"`.
- A language link in the header and footer: "Русский" on English pages, "English" on Russian pages,
  pointing at the twin.

### Contact form

Same form and storage as English, Russian labels and errors. The inquiry email to the team stays
English and gains a line "Language: Russian (/ru/contact)". The sent page is Russian.

## How "done" is judged (outside checks, not the author)

1. **Yandex Speller** (Yandex's free spelling service) over every Russian string: 0 errors, or each
   remaining flag listed and justified (brand and product names).
2. **LanguageTool** (open source, Russian rules) over every Russian string: 0 grammar errors, or
   each remaining flag listed and justified.
3. **A parity test** in the repository: every English public path has a Russian twin and vice
   versa; every Russian data object has the same keys and list lengths as its English twin; every
   number in an English string appears in its Russian twin.
4. **A Russian-language reviewer** (a helper agent briefed as a senior Russian B2B copywriter, at
   the owner's request) reads every page and signs off. It is the same model as the author, so it is
   recorded as a review, not an independent check.
5. **Browser tests**: every `/ru` page answers 200 with `lang="ru"`, `hreflang` both ways, Cyrillic
   drawn in the companion face (not a system font), no horizontal scroll at 375 px, the 44 px touch
   floor; every English page unchanged (existing suites green).
6. All repository gates (`node .claude/skills/gates/run-gates.mjs`) green, including the bundle and
   CMS Worker size budgets.
7. After merge: Yandex Webmaster reindex for the top 10 Russian pages; pass = Russian pages appear
   under "Searchable pages" within 14 days.

## Owner decisions (2026-11-15)

- **Fonts: Roboto Flex + Cormorant** (option B of a rendered comparison of four). Roboto Flex has a
  width axis, so the 122%-wide, weight-860 capital headlines keep their shape; Cormorant italic
  stands in for Instrument Serif's accent, sized up to match its height. Both are OFL-licensed, are
  self-hosted like the current faces (no Google Fonts request), and are declared under the existing
  family names with a Cyrillic `unicode-range` only.
- **Database-held text stays English.** `/ru/journal` and `/ru/case-studies` are Russian hub pages
  that list the English posts with a «на английском» label; posts and case studies have NO Russian
  twin and no `hreflang` pair. The 40 garment types get a Russian name table in code, keyed by the
  English type, used on Russian cards; product names (brand names) stay as they are.
- One pull request, merged only when everything is translated and checked; no feature flag.
- Same contact form as English (152-FZ risk accepted).
- Payment and delivery: say nothing; discussed per enquiry.

## Corrections from the builder check (2026-11-15)

A reviewer read this design against the code; these are recorded as builder calls.

- **The 404.** `apps/cms/src/app/not-found.tsx` sits at the app root and draws its own `<html>`
  because a route-group `notFound()` renders blank without JavaScript (the file's comments). The
  Russian 404 is therefore the SAME root file, choosing language from the request path, not a
  route-group 404; nothing under `/ru` calls a group-level not-found.
- **The language link stays out of the shared footer.** `packages/shared/src/siteFooter.ts` also
  draws the 205 English garment pages and is pinned by the viewer's aria-snapshot tests. The link
  lives only in the website's own header and footer components; the viewer is untouched.
- **A sixth path list:** `CMS_PUBLIC_PATHS` in `apps/cms/siteHostRules.mjs` (what the admin host
  forwards to the apex) gains the `/ru` twins.
- **The contact form's redirect** is built as `/contact…` in
  `apps/cms/src/app/(frontend)/contact/submit/route.ts`. The Russian form posts a hidden language
  field, and the route sends a Russian sender back to `/ru/contact`.
- **Locale in metadata:** `buildMetadata` (`apps/cms/src/lib/seo.ts`) sets Open Graph
  `locale: 'en_US'`; it takes a language input (`ru_RU` on Russian pages), and the sitemap function
  in `apps/cms/src/lib/searchVisibility.ts` takes the same.
- Which paths need twins is an explicit list: pages only. Not `robots.txt`, `llms.txt`,
  `llms-full.txt`, the journal RSS or share images.
- `hreflang` values are `en`, `ru` and `x-default` (English). The sitemap carries the same
  alternates and follows the English twin's visibility and `lastModified` rules.
- Cloudflare Turnstile on the Russian form is given `language: 'ru'`; it is the same widget host, so
  the security policy does not change.
- Garment pages give no route back to Russian (browser back only); accepted.

## Left to the builder

File names, the strings-object shape, test layout, batching of the translation work, the order of
pages, and which existing tests to extend.
