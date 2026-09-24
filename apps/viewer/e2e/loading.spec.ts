import { expect, test } from '@playwright/test'

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
    const fallback = await page.locator('.stage__error:not([hidden])').count()
    test.skip(fallback > 0, `${browserName}: no WebGL here, the stage is in poster fallback`)

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
