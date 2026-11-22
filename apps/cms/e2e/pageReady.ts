import { expect, type Page } from '@playwright/test'

/**
 * Has the page's own script run yet? A test that acts before it has is the one cause behind most
 * of this suite's WebKit flakiness.
 *
 * ⚠️ `page.goto` RETURNS AT `load`, AND ON A BUSY MACHINE THAT IS BEFORE THE PAGE'S SCRIPTS RUN.
 * Until they do, nothing listens (a key press is lost, a menu's closing mark is never set), and
 * when they do, React puts the server's markup back: whatever a test added to the page in between
 * is wiped. Counted 22 Nov 2026 over the WebKit job of the last 55 CI runs (64 attempts, every one
 * with at least one flaky test, 5 red, two of which held back a deploy that day, #451):
 *
 * - languageNote.spec.ts, 216 of the 259 flaky or failed results: one key press, sent at once,
 *   that nobody heard, so the note never came;
 * - productsDrawing.spec.ts, 21: the 40 copied cards were wiped (41 cards became 1 again, watched
 *   here), so no picture far down was ever fetched and "0 copies fetched" failed the test;
 * - navProgress.spec.ts, 2: the link the test adds to the page was wiped before the click;
 * - navbar.spec.ts, 6: the menu closed before its script could mark it closing, and a transition
 *   the test was waiting on was cancelled under it.
 *
 * Reproduced on this Mac with `holdThePageBusy` below: without the wait the language note failed
 * 8 of 8 and the copies were wiped; with it, 8 of 8 passed and the copies stayed.
 *
 * THE SIGN: the footer clock reads `--:--` in the server's HTML and a time once the browser has
 * drawn it (FooterClock.tsx), on every page of the site, the 404 included. footer.spec.ts reads
 * the same sign. A page whose scripts are refused on purpose (navbar.spec.ts, "before the page
 * hydrates") never shows it, so this is called by the tests that need it, never for every page.
 */
export const scriptsHaveRun = (page: Page) =>
  expect(
    page.locator('.footer-clock__time span').first(),
    "the page's scripts have not run",
  ).not.toHaveText('--:--', { timeout: 15_000 })

/** The opposite, for a control: the page is on screen and its scripts have NOT run yet. */
export const scriptsHaveNotRun = (page: Page) =>
  expect(
    page.locator('.footer-clock__time span').first(),
    'the page was never busy, so this control measured nothing',
  ).toHaveText('--:--')

/**
 * A busy machine, made on purpose, for the controls. React hands its work to the browser through
 * a MessageChannel; each hand-over is held back here, so the page is loaded and on screen well
 * before its scripts have run. Call it before `page.goto`.
 */
export const holdThePageBusy = (page: Page, ms = 400) =>
  page.addInitScript((delay) => {
    const post = MessagePort.prototype.postMessage
    MessagePort.prototype.postMessage = function (this: MessagePort, ...args: unknown[]) {
      setTimeout(() => (post as (...all: unknown[]) => void).apply(this, args), delay)
    } as typeof post
  }, ms)
