import { expect, test } from './offlineMedia'

/**
 * Pressing a garment card fetches that garment page's document ahead (faster-taps spec, Part 3;
 * lib/speculationRules.ts): Chrome's speculation rules, `conservative`, so the fetch starts on the
 * press and the click that follows opens a page already in hand.
 *
 * What the test does on purpose, all measured 27 Oct:
 * - It PRESSES with the mouse, after scrolling the card into view and proving the press lands on its
 *   link. A scripted `dispatchEvent('pointerdown')` starts no prefetch at all, and a raw press below
 *   the fold lands on nothing.
 * - It writes the card's link as a path. On the live site the page and the card's
 *   `https://wear-run.com/products/…` link share one origin; `next start` serves the page on
 *   localhost, where the rule's `/products/*\/*` cannot match that full address.
 * - In Chromium it reads Chrome's own account through the DevTools protocol (`Preload` domain):
 *   when the changed link becomes a candidate, and when the prefetch starts. Playwright's request
 *   event missed the prefetch in 8 runs of 8 while Chrome reported it `Running`: Chrome sends it
 *   outside the page. Here it then ends `PrefetchFailedNon2XX`, because `next start` has no garment
 *   page (the viewer Worker draws it); on the live site it is a 200.
 * - Every engine is held to what it says it supports and to its own rule for plain http. Playwright
 *   1.64.1's WebKit supports the rules but refuses a prefetch over http ("Prefetch request denied:
 *   URL must be secure (HTTPS)"; Chromium counts localhost as secure), so here it must REFUSE, which
 *   still proves the rule ran on the press. Firefox does not support them and must send nothing.
 *   (Safari itself ships them switched off: caniuse, 26.2 onwards.) An engine that changes fails
 *   here, and that is worth knowing.
 */
test('pressing a garment card fetches its page ahead where the browser supports it', async ({
  page,
  browserName,
}) => {
  const refusals: string[] = []
  page.on('console', (message) => {
    if (/Prefetch request denied/.test(message.text())) refusals.push(message.text())
  })
  const ahead: string[] = []
  page.on('request', (request) => {
    if ((request.headers()['sec-purpose'] ?? '').startsWith('prefetch')) {
      ahead.push(new URL(request.url()).pathname)
    }
  })
  await page.goto('/products')
  const card = page.locator('.product-card a.card-gallery__slide[tabindex="0"]').first()
  await expect(card).toBeVisible()
  const path = new URL((await card.getAttribute('href')) ?? '', 'https://wear-run.com').pathname
  const supported = await page.evaluate(
    () => HTMLScriptElement.supports?.('speculationrules') ?? false,
  )
  if (browserName === 'chromium')
    expect(supported, 'Chromium supports speculation rules').toBe(true)
  const httpRefused = browserName === 'webkit' && new URL(page.url()).protocol === 'http:'

  // Chrome re-checks a changed link against the rules on its own schedule, so the press waits until
  // Chrome lists the link as a candidate; and Chrome says when a prefetch of it starts.
  let candidate: Promise<unknown> = Promise.resolve()
  const chrome: string[] = []
  if (browserName === 'chromium') {
    const devtools = await page.context().newCDPSession(page)
    candidate = new Promise<void>((resolve, reject) => {
      const late = setTimeout(
        () => reject(new Error(`Chrome never listed ${path} as a speculation candidate`)),
        5_000,
      )
      devtools.on('Preload.preloadingAttemptSourcesUpdated', (event) => {
        const sources = event.preloadingAttemptSources as Array<{ key: { url: string } }>
        if (sources.some((source) => new URL(source.key.url).pathname === path)) {
          clearTimeout(late)
          resolve()
        }
      })
    })
    devtools.on('Preload.prefetchStatusUpdated', (event) => {
      if (new URL(event.prefetchUrl).pathname === path) chrome.push(event.status)
    })
    await devtools.send('Preload.enable')
  }
  await card.evaluate((link: HTMLAnchorElement, own) => link.setAttribute('href', own), path)
  await candidate

  await card.scrollIntoViewIfNeeded()
  const box = await card.boundingBox()
  if (!box) throw new Error('the card has no box')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const onLink = await card.evaluate(
    (link, [px, py]) => link.contains(document.elementFromPoint(px as number, py as number)),
    [x, y],
  )
  expect(onLink, 'the press lands on the card’s link').toBe(true)
  expect(chrome, 'nothing is fetched before the press (conservative)').toEqual([])
  // A press without the release, so the page stays: the click would leave it.
  await page.mouse.move(x, y)
  await page.mouse.down()
  if (browserName === 'chromium') {
    await expect.poll(() => chrome, { timeout: 3_000 }).toContain('Running')
  } else if (supported && httpRefused) {
    await expect.poll(() => refusals.length, { timeout: 3_000 }).toBeGreaterThan(0)
    expect(ahead).toEqual([])
  } else if (supported) {
    await expect.poll(() => ahead, { timeout: 3_000 }).toContain(path)
  } else {
    await page.waitForTimeout(800)
    expect(ahead).toEqual([])
  }
})
