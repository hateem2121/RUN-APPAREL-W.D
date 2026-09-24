import { expect, test } from '@playwright/test'
import {
  containsGarmentName,
  isAnnouncedSelected,
  isHeadingLevel1Announcement,
  isTabAnnouncement,
} from '../../../scripts/voiceover.mjs'

/**
 * AC-18 — the viewer's own consumer test for `scripts/voiceover.mjs` (PR #28, merged
 * 2026-09-23 as `06fd3eb`). That script drives REAL VoiceOver through Guidepup over a
 * real WebKit window — not reproducible here, and it has its own workflow
 * (`.github/workflows/voiceover.yml`, `workflow_dispatch` + a `paths:`-scoped
 * `pull_request` trigger) and its own synthetic-string unit tests
 * (`apps/cms/src/voiceOver.test.ts`) for the classifier functions in isolation.
 *
 * What THIS test proves, and what neither of those can: that the classifiers agree
 * with the REAL page's rendered content, not just with hand-written example strings.
 * It builds the announcement text the way VoiceOver is documented to speak it (per
 * `voiceover.mjs`'s own comments on `isTabAnnouncement`/`isAnnouncedSelected`) FROM
 * the live DOM — the heading's real text, the real tab labels and `aria-selected`
 * state — and confirms `voiceover.mjs`'s classifiers still recognise them.
 *
 * What each half can catch, measured 2026-09-25 rather than claimed. The TAB test fails
 * when `aria-selected` stops marking exactly one tab (planted: 4/4 engines red, "expected
 * exactly one tab classified as selected") or when `role="tab"` goes, on every CI run
 * rather than only on the VoiceOver workflow's own narrower trigger. The HEADING test is
 * weaker by construction: it builds the phrase FROM the heading, so a renamed heading
 * still passes; it fails only when the page has no <h1> or its real text stops
 * classifying (say, a heading that itself reads "…, tab").
 */
test.describe('AC-18 — the VoiceOver robot classifiers agree with the real page (consumer test)', () => {
  test('the real heading text classifies as a level-1 heading announcing the garment', async ({
    page,
  }) => {
    await page.goto('/n001/wine')
    const heading = await page.getByRole('heading', { level: 1 }).textContent()
    expect(heading, 'no <h1> text found').toBeTruthy()
    if (!heading) return

    // The shape voiceover.mjs's own tests use: "<name>, heading level 1".
    const spokenPhrase = `${heading}, heading level 1`
    expect(
      isHeadingLevel1Announcement(spokenPhrase),
      `"${spokenPhrase}" was not classified as a level-1 heading announcement`,
    ).toBe(true)
    expect(
      containsGarmentName(spokenPhrase, heading),
      `containsGarmentName did not recognise the page's own heading text within its own announcement`,
    ).toBe(true)
  })

  test('every real colourway tab classifies as a tab, and exactly the selected one as selected', async ({
    page,
  }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')].map((el, i, all) => ({
        name: el.getAttribute('aria-label') ?? el.textContent ?? '',
        selected: el.getAttribute('aria-selected') === 'true',
        index: i + 1,
        total: all.length,
      })),
    )
    expect(tabs.length, 'no role="tab" elements found on the page').toBeGreaterThan(1)

    const classifiedSelected: string[] = []
    for (const tab of tabs) {
      // The documented shape: "<name>, tab, <n> of <total>[, selected]".
      const spokenPhrase = `${tab.name}, tab, ${tab.index} of ${tab.total}${tab.selected ? ', selected' : ''}`
      expect(
        isTabAnnouncement(spokenPhrase),
        `"${spokenPhrase}" was not classified as a tab announcement`,
      ).toBe(true)
      const announcedSelected = isAnnouncedSelected(spokenPhrase)
      expect(
        announcedSelected,
        `"${spokenPhrase}": isAnnouncedSelected() disagreed with aria-selected="${tab.selected}"`,
      ).toBe(tab.selected)
      if (announcedSelected) classifiedSelected.push(tab.name)
    }
    // Exactly one tab selected — the same fact AC-16/AC-08 already assert structurally,
    // reconfirmed here through the VoiceOver classifier specifically.
    expect(classifiedSelected, 'expected exactly one tab classified as selected').toHaveLength(1)
  })
})
