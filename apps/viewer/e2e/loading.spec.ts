import { expect, test } from '@playwright/test'
import { stageFallsBack } from './stage'

/**
 * MO-20 — the stage's loading readout is CORRECT FOR ITS PHASE across a real download.
 *
 * `loadProgress.test.ts` proves `describeLoad()`'s arithmetic (percent floors, never
 * claims done early, `preparing` carries no percent). This is the integration half: does
 * `Stage.tsx` WIRE that output into what a visitor sees, while bytes actually arrive?
 *
 * ⚠️ SLOWED, OR IT MEASURES NOTHING. Measured 2026-09-25: at full speed every engine saw
 * two or three samples, all "LOADING 3D MODEL" with no percentage, and never "preparing"
 * — every assertion passed vacuously (the first draft ran this on five colourways, which
 * only repeated the vacuity). The network is therefore slowed through CDP to ~150 kB/s
 * (half `placeholder-webgl.spec.ts`'s 300: at 300 this saw three percentages, the bare
 * minimum, measured 2026-09-25), which only
 * Chromium offers; the readout is the same JavaScript in every engine. And the test
 * REQUIRES a minimum of observed percentages, so a download too quick to watch fails
 * loudly instead of passing.
 *
 * `preparing` stays a unit-level claim: `loadProgress.ts` records that e2e cannot reach
 * it reliably (the gap between the last byte and model-viewer's parse is too brief on
 * the fixture's GLB). It is still checked here whenever a sample happens to land in it.
 */
const SLOW = { offline: false, latency: 50, downloadThroughput: 150_000, uploadThroughput: 150_000 }

test.describe('MO-20 — the stage readout is correct for its phase', () => {
  test.setTimeout(120_000)

  test('on a slowed real download the number only climbs, never reads 100% early, and the bar matches it', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the network is slowed through CDP, which only Chromium has; the readout logic is the same JavaScript in every engine',
    )
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', SLOW)

    // The fixture server sends no content-length by default (serve.mjs explains why), and
    // without one the page can show no percentage at all. Ask for it on THIS request only.
    await page.route('**/fixtures/n001.glb', (route) =>
      route.continue({ url: `${route.request().url()}?with-length=1` }),
    )
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 })
    const fallback = await stageFallsBack(page)
    test.skip(fallback, `${browserName}: no WebGL here, the stage is in poster fallback`)

    const samples: { text: string; percent: number | null; scaleX: number | null }[] = []
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      const sample = await page.evaluate(() => {
        const block = document.querySelector('.stage__loading')
        if (!block) return null
        const text = block.querySelector('.stage__loading-title')?.textContent ?? ''
        const fill = block.querySelector('.stage__loading-bar span') as HTMLElement | null
        const scale = /scaleX\(([\d.]+)\)/.exec(fill?.style.transform ?? '')
        const percent = /(\d+)%/.exec(text)
        return {
          text,
          percent: percent ? Number(percent[1]) : null,
          scaleX: scale ? Number(scale[1]) : null,
        }
      })
      if (!sample) break // .stage__loading unmounted: the phase reached 'ready'
      samples.push(sample)
      await page.waitForTimeout(60)
    }

    // The live model must actually be there, or everything below is about a load that
    // never happened.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Boolean(
              (document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded,
            ),
          ),
        { timeout: 10_000 },
      )
      .toBe(true)

    const downloading = samples.filter((x) => x.text.startsWith('LOADING'))
    const counted = downloading.filter((x) => x.percent !== null)
    expect(
      counted.length,
      `only ${counted.length} downloading readouts carried a percentage — too few to judge, so this measured nothing`,
    ).toBeGreaterThanOrEqual(3)

    for (const x of downloading) {
      expect(x.text, `"${x.text}" is not the downloading-phase title`).toMatch(/^LOADING 3D MODEL/)
    }
    for (let i = 1; i < counted.length; i++) {
      const [before, now] = [counted[i - 1]?.percent ?? 0, counted[i]?.percent ?? 0]
      expect(now, `the number went BACKWARDS, ${before}% → ${now}%`).toBeGreaterThanOrEqual(before)
    }
    for (const x of counted) {
      expect(x.percent, `"${x.text}" claims 100% while still downloading`).toBeLessThan(100)
      if (x.scaleX !== null) {
        expect(
          Math.abs(x.scaleX - (x.percent ?? 0) / 100),
          `the bar (scaleX ${x.scaleX}) does not match the number it sits under ("${x.text}")`,
        ).toBeLessThan(0.011)
      }
    }
    console.log(
      `MO-20 observed: ${counted.map((x) => `${x.percent}%`).join(' → ')}${samples.some((y) => y.text.startsWith('PREPARING')) ? ' → PREPARING' : ''}`,
    )
    for (const x of samples.filter((y) => y.text.startsWith('PREPARING'))) {
      expect(x.text, `"${x.text}": preparing shows an invented percentage`).not.toMatch(/\d+%/)
    }
  })
})

/**
 * SPEC §5.1 — screen readers hear the download "now and then, not on every tick".
 *
 * `Stage.tsx` feeds its `role="status"` line `announcedPercent`, the percentage floored to
 * 25% steps, so VoiceOver hears at most four numbers while the visible title changes
 * several times a second. Until 2026-09-25 nothing tested that: delete the flooring and
 * every suite stayed green while the old preloader's failure (~90 announcements in under
 * two seconds) came back. MO-20's sampler above polls every 60 ms and would MISS
 * announcements between polls, so this one records every change with a
 * MutationObserver installed before the page's own scripts run.
 *
 * Proven both ways on 2026-09-25: with `announcedPercent = load.percent` planted, the
 * announced numbers stop being multiples of 25 and this fails; restored, it passes.
 */
test.describe('SPEC §5.1 — screen readers hear the progress now and then', () => {
  test.setTimeout(120_000)

  test('on a slowed real download the spoken line moves in 25% steps while the screen counts every percent', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the network is slowed through CDP, which only Chromium has; the throttle is the same JavaScript in every engine',
    )
    await page.addInitScript(() => {
      const log: { spoken: string[]; shown: string[] } = { spoken: [], shown: [] }
      ;(window as unknown as { __readout: typeof log }).__readout = log
      const push = (list: string[], text: string) => {
        if (text && list[list.length - 1] !== text) list.push(text)
      }
      new MutationObserver(() => {
        for (const el of document.querySelectorAll('[role="status"]')) {
          push(log.spoken, el.textContent?.trim() ?? '')
        }
        push(log.shown, document.querySelector('.stage__loading-title')?.textContent ?? '')
      }).observe(document, { subtree: true, childList: true, characterData: true })
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', SLOW)
    await page.route('**/fixtures/n001.glb', (route) =>
      route.continue({ url: `${route.request().url()}?with-length=1` }),
    )
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 })
    const fallback = await stageFallsBack(page)
    test.skip(fallback, `${browserName}: no WebGL here, the stage is in poster fallback`)

    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Boolean(
              (document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded,
            ),
          ),
        { timeout: 90_000 },
      )
      .toBe(true)

    const { spoken, shown } = await page.evaluate(
      () => (window as unknown as { __readout: { spoken: string[]; shown: string[] } }).__readout,
    )
    const shownPercents = shown.filter((t) => /\d+%/.test(t))
    const spokenLoading = spoken.filter((t) => t.startsWith('Loading the interactive 3D model'))
    const spokenPercents = spokenLoading
      .map((t) => /(\d+) percent/.exec(t))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]))
    console.log(
      `SPEC §5.1 observed: screen showed ${shownPercents.length} percentages; spoken: ${spokenLoading.join(' | ')}`,
    )

    // Not vacuous: the screen really did tick many times, and the spoken line really did
    // speak numbers during the download. Without both, "few announcements" proves nothing.
    expect(
      shownPercents.length,
      `the visible title showed only ${shownPercents.length} percentages — too quick a download to judge throttling`,
    ).toBeGreaterThanOrEqual(8)
    expect(
      spokenPercents.length,
      'the spoken line never said a percentage during the download',
    ).toBeGreaterThanOrEqual(2)

    for (const n of spokenPercents) {
      expect(n % 25, `the screen reader was told "${n} percent" — not a 25% step`).toBe(0)
    }
    // A bare "Loading…" plus 0, 25, 50 and 75 at most. 100 is never announced: at 100 the
    // phase is already "preparing", which has its own sentence.
    expect(spokenLoading.length, spokenLoading.join(' | ')).toBeLessThanOrEqual(5)
    expect(spokenLoading.length).toBeLessThan(shownPercents.length)
  })
})

/**
 * MO-21 — the placeholder photo shows during the download and is gone once the
 * model is live. Already thoroughly proven, WITH its own negative control, in
 * `placeholder-webgl.spec.ts` ("is on the stage, blurred, under the readout — then
 * gone within a beat of load" + "NEGATIVE CONTROL: a payload with no poster paints
 * no image during the download"). PROVE ONLY here — not rebuilt.
 */
test.describe('MO-21 — placeholder photo during download, gone on load — prove only', () => {
  test('placeholder-webgl.spec.ts already covers this row', () => {
    // No new assertion. This test exists so the row is traceable to a file, per
    // this batch's own convention for "prove only" rows.
    expect(true).toBe(true)
  })
})

/**
 * CR-05 — the progress fill GLIDES to each new value on `--fast` (200 ms); it does not step.
 *
 * The audit read "no transition while loading" on all 12 pages. Two things it could have
 * read, and both are correct by design: the outer `.stage__loading-bar` (it never carries
 * the transition; its inner span does), or the indeterminate phase (`transition: none` on
 * purpose, a looping animation instead, when there is no size to count against). So this
 * reads the FILL, only while the bar is determinate, and judges what is DRAWN: every frame's
 * computed scale against the inline target the page last set. A stepped fill lands on each
 * target in the frame it is set; an eased one shows frames strictly between the old target
 * and the new one.
 */
test.describe('CR-05 — the progress fill eases to each value, it does not step', () => {
  test.setTimeout(120_000)

  test('while determinate, the fill transitions transform on --fast and draws in-between frames', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the network is slowed through CDP, which only Chromium has; the CSS is the same in every engine',
    )
    // ⚠️ MOTION MUST BE ASKED FOR. playwright.config.ts sets `reducedMotion: 'reduce'`,
    // which 1.62.1 silently ignored and 1.63.0 applies (its new `testOptions.reducedMotion`).
    // Under `reduce`, base.css collapses every transition to 0.01ms, so this test read
    // `transform 1e-05s` 3/3 on 1.63 (2026-09-26) while the fill itself was unchanged.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', SLOW)
    await page.route('**/fixtures/n001.glb', (route) =>
      route.continue({ url: `${route.request().url()}?with-length=1` }),
    )
    // Every drawn frame: the target the page set (inline scaleX) and what was painted.
    await page.addInitScript(() => {
      const log: { target: number; drawn: number; transition: string }[] = []
      ;(window as unknown as { __fill: typeof log }).__fill = log
      const tick = () => {
        const bar = document.querySelector('.stage__loading-bar')
        const fill = bar?.querySelector('span') as HTMLElement | null
        if (fill && bar && !bar.classList.contains('stage__loading-bar--indeterminate')) {
          const target = /scaleX\(([\d.]+)\)/.exec(fill.style.transform)
          const matrix = /matrix\(([-\d.e]+)/.exec(getComputedStyle(fill).transform)
          if (target && matrix) {
            const cs = getComputedStyle(fill)
            log.push({
              target: Number(target[1]),
              drawn: Number(matrix[1]),
              transition: `${cs.transitionProperty} ${cs.transitionDuration}`,
            })
          }
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 })
    test.skip(
      await stageFallsBack(page),
      `${browserName}: no WebGL here, the stage is in poster fallback`,
    )
    await expect(page.locator('.stage__loading')).toHaveCount(0, { timeout: 90_000 })

    const frames = await page.evaluate(
      () =>
        (window as unknown as { __fill: { target: number; drawn: number; transition: string }[] })
          .__fill,
    )
    expect(
      frames.length,
      'no determinate frame was drawn, so this measured nothing',
    ).toBeGreaterThanOrEqual(10)
    expect(
      [...new Set(frames.map((f) => f.transition))],
      'the determinate fill does not transition transform on --fast (200ms)',
    ).toEqual(['transform 0.2s'])

    // A stepped fill is computed AT its target in every frame (with `transition: none` the
    // computed transform is the inline one). A frame drawn away from its target is a frame of
    // the glide toward it.
    const between = frames.filter((f) => Math.abs(f.drawn - f.target) > 0.001).length
    const targets = new Set(frames.map((f) => f.target)).size
    console.log(
      `CR-05: ${frames.length} determinate frames, ${targets} targets, ${between} in-between`,
    )
    expect(targets, 'the fill was never retargeted, so there was nothing to ease').toBeGreaterThan(
      2,
    )
    expect(between, 'every frame landed exactly on its target: the fill steps').toBeGreaterThan(0)
  })
})
