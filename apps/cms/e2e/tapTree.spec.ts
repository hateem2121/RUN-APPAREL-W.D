import { intentTreeFor, stateTreeFor } from '../tapStore.mjs'
import { expect, type Page, test } from './offlineMedia'

type Request = Awaited<ReturnType<Page['waitForRequest']>>

/**
 * stateTreeFor (tapStore.mjs) rebuilds the `next-router-state-tree` header a settled tap sends, so
 * the post-deploy warm-ups can fill the store with exactly what buyers will ask for. This holds it
 * to Chromium's own header for every menu link on /faq: a Next.js upgrade that changes the format
 * fails here, before a warm-up starts filling keys nobody asks for.
 *
 * The click is a plain `element.click()`, never a hover: a hover would prefetch the page ahead
 * (IntentLink) and the tap would send no request at all.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'measured in Chromium')

test('a settled tap from /faq sends the tree stateTreeFor builds', async ({ page }) => {
  await page.goto('/faq')
  await expect(page.locator('h1')).toBeVisible()
  // Only links a visitor can see: Next prefetches a link as it enters the viewport, so a hidden
  // one (a closed menu) is still unknown at the tap, and the browser then sends the START page's
  // own tree instead (measured 27 Oct; kept correctly, never warmed).
  const paths: string[] = await page.evaluate(() => [
    ...new Set(
      [...document.querySelectorAll<HTMLAnchorElement>('header a[href^="/"]')]
        .filter((a) => {
          const box = a.getBoundingClientRect()
          return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight
        })
        .map((a) => new URL(a.href).pathname)
        .filter((path) => path !== '/faq' && !/^\/products\/[^/]+/.test(path)),
    ),
  ])
  expect(paths.length, 'no menu links found on /faq').toBeGreaterThan(2)

  for (const path of paths) {
    await page.goto('/faq')
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForTimeout(2500) // the menu's routes are prefetched: the tap is settled
    let tree: string | null = null
    const listen = (request: Request) => {
      const url = new URL(request.url())
      if (
        url.pathname === path &&
        url.searchParams.has('_rsc') &&
        !request.headers()['next-router-prefetch']
      ) {
        tree = request.headers()['next-router-state-tree'] ?? null
      }
    }
    page.on('request', listen)
    await page.evaluate((to) => {
      const link = [...document.querySelectorAll<HTMLAnchorElement>('header a[href^="/"]')].find(
        (a) => new URL(a.href).pathname === to,
      )
      link?.click()
    }, path)
    await page.waitForURL((url) => url.pathname === path)
    page.off('request', listen)
    expect(tree, `${path}: the tap sent no tree`).not.toBeNull()
    expect(tree, `${path}: the browser's tree and stateTreeFor differ`).toBe(
      stateTreeFor(path, '/faq'),
    )
  }
})

/**
 * A hover fetches the page ahead (IntentLink, `prefetch={true}`) with a tree of its own, which the
 * warm-ups keep beside the tap's (review of 27 Oct; the live check that day found every hover in a
 * fresh region drawn). intentTreeFor rebuilds it; this holds it to Chromium's own header for every
 * menu link on /faq, so a Next.js upgrade that changes the format fails here first.
 */
test('a hover on /faq sends the tree intentTreeFor builds', async ({ page }) => {
  await page.goto('/faq')
  await expect(page.locator('h1')).toBeVisible()
  const paths: string[] = await page.evaluate(() => [
    ...new Set(
      [...document.querySelectorAll<HTMLAnchorElement>('header a[href^="/"]')]
        .filter((a) => {
          const box = a.getBoundingClientRect()
          return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight
        })
        .map((a) => new URL(a.href).pathname)
        .filter((path) => path !== '/faq' && !/^\/products\/[^/]+/.test(path)),
    ),
  ])
  expect(paths.length, 'no menu links found on /faq').toBeGreaterThan(2)

  for (const path of paths) {
    await page.goto('/faq')
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForTimeout(1000)
    const fetched = page.waitForRequest((request) => {
      const url = new URL(request.url())
      return (
        url.pathname === path &&
        url.searchParams.has('_rsc') &&
        !request.headers()['next-router-prefetch']
      )
    })
    await page.locator(`header a[href="${path}"]:visible`).first().hover()
    const tree = (await fetched).headers()['next-router-state-tree'] ?? null
    expect(tree, `${path}: the browser's hover tree and intentTreeFor differ`).toBe(
      intentTreeFor(path, '/faq'),
    )
  }
})
