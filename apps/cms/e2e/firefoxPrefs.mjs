/**
 * Firefox preferences for the public-site browser tests. `playwright.config.ts` applies
 * them to the `firefox` project; `e2e/firefox-coop-hang.mjs` measures what they do.
 *
 * ⚠️ FIREFOX IGNORES `Cross-Origin-Opener-Policy` IN THIS TEST BROWSER, AND ONLY HERE.
 * Every page on this site sends `Cross-Origin-Opener-Policy: same-origin`, and that
 * header trips a bug in Playwright's Firefox driver (microsoft/playwright#42731, open
 * when this was written). A new tab starts on about:blank, so its first navigation to
 * one of our pages makes Firefox replace the browsing context. Playwright's Firefox
 * keeps the new context in the same content process, and its driver gives the new
 * message channel the same name as the old one ('process-<pid>'), with message numbers
 * starting again at 1. The browser side then answers new messages from the old channel's
 * cache, and the one `page.goto` is waiting for is lost. The page loads completely
 * (`readyState` is "complete"); only the test never hears about it, and times out.
 *
 * In CI this was `page.goto: Test timeout of 30000ms exceeded … waiting until "load"`,
 * in the `firefox` project only (`chromium` never): 27 times in 25 of the 40 CI runs
 * between 2026-09-10 and 2026-09-18, across 19 tests in 8 of the 14 spec files. The
 * retry hid it until run 35311293630 (PR #17), where the same test hung on both tries
 * and the pull request went red. Measured 2026-09-18 on a Mac with
 * `e2e/firefox-coop-hang.mjs` against this suite's own server, four tabs at a time, in
 * three pairs of runs made alternately in one session: 57 of 800 first navigations never
 * resolved with Firefox's default, and 0 of 800 with the preference below.
 *
 * WHAT IT COSTS: nothing these tests measure. The COOP tests in `notfound.spec.ts` read
 * the header through `request` and never depend on how a browser reacts to it, and the
 * `chromium` project still obeys COOP. The live site is untouched: it still sends the
 * header, and a visitor's Firefox still obeys it.
 *
 * NOT FIXED BY a longer timeout, a retry or a different `waitUntil`: the message is
 * lost, not late. Nor by adding COEP, the other way round the bug that upstream found.
 * That would change the live site, and `notfound.spec.ts` records why COEP is absent.
 *
 * The viewer's Firefox project does not need this: its fixture server replays only the
 * `/*` block of `_headers`, which carries no COOP, and it hit no such timeout in the
 * same 40 runs. It will need it if that fixture ever sends COOP on a page.
 *
 * REMOVE THIS ONLY WHEN a Playwright release carries the upstream fix, AND
 * `node e2e/firefox-coop-hang.mjs --prefs=none` then shows 0 stuck. Guarded by
 * `src/firefoxPrefs.test.ts`.
 */
export const FIREFOX_USER_PREFS = {
  'browser.tabs.remote.useCrossOriginOpenerPolicy': false,
}
