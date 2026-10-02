import { describe, expect, it } from 'vitest'
import { buildViewerResponse } from './endpoints/projectViewer'
import { mergeSiteSettings } from './lib/projectPublic'

/**
 * XS-08 — contact details identical across hosts.
 *
 * Step 1 confirmed these are NOT one shared function, despite both reading the
 * same `site-settings` global document — they are two independently-maintained
 * projections: `mergeSiteSettings` (the site's own footer/header) and
 * `buildViewerResponse`'s inline `siteSettings` block (the viewer's public API
 * contract, deliberately whitelist-only — see that file's own docblock). This
 * test is the CONTRACT between them: given the same input document, both must
 * resolve `email` and `whatsappNumber` to the same string.
 *
 * ⚠️ THE FOOTER HALF WAS REVERSED ON PURPOSE (visual audit VA-31). Until 2026-10-02 the
 * second test asserted the footer — and its works-location field, `worksCoordinates` —
 * was ABSENT from the viewer's payload: the two hosts were meant to end differently. The
 * owner chose one footer everywhere and approved changing this test the same day, so it
 * now asserts the opposite: both hosts resolve the SAME footer from the same document
 * (WCAG 2.2 SC 3.2.6 Consistent Help asks for contact details in the same place on
 * every page of a site).
 *
 * A minor, unreachable-in-practice observation found while confirming Step 1: the
 * two projections resolve an EMPTY string differently (`mergeSiteSettings` uses
 * `text(v) || default`, treating '' as falsy and falling back;
 * `buildViewerResponse` uses `v ?? default`, which does NOT fall back for '').
 * Both `email` and `whatsappNumber` are `required: true` in
 * `apps/cms/src/globals/SiteSettings.ts`, so Payload refuses to store an empty
 * value in the first place — the divergence exists in the code but cannot be
 * reached through the CMS. Not fixed here (out of this task's scope); this test
 * therefore exercises only realistic, populated values, which is what the
 * required-field constraint guarantees production always has.
 */

const deps = { richTextToHtml: () => '<p>intro</p>' }
const origin = 'https://cms.example'
const media = (url: string) => ({
  url,
  alt: 'a',
  width: 1200,
  height: 1500,
  mimeType: 'image/webp',
})

const product = (o: Record<string, unknown> = {}) => ({
  productCode: 'N001',
  slug: 'n001',
  productName: 'Velocity Tee',
  category: 'Sportswear',
  variantMode: 'single-glb-variants',
  glbAsset: media('/media/n001.glb'),
  posterFallback: media('/media/fallback.webp'),
  fabricComposition: 'Poly',
  gsm: '160',
  performanceFeatures: [{ feature: 'Stretch' }],
  garmentFit: 'Regular',
  customisationIntro: { root: {} },
  customisationSteps: [{ number: 1, title: 'A', body: 'b' }],
  retiredMessage: 'retired notice',
  ...o,
})

const colourway = (o: Record<string, unknown> = {}) => ({
  variantId: 'N001-NAVY',
  displayName: 'Navy',
  slug: 'navy',
  sequence: 1,
  posterPreview: media('/media/navy.webp'),
  glbAsset: media('/media/navy.glb'),
  isDefault: true,
  altText: 'navy',
  hexSwatch: '#123456',
  ...o,
})

/** A realistic, fully-populated site-settings document — the shape Payload's
 * `required: true` fields guarantee production always has. */
const settingsDoc = {
  companyName: 'RUN APPAREL (PVT) LTD',
  email: 'partner@wear-run.help',
  whatsappNumber: '+923001234567',
  catalogueUrl: 'https://wear-run.help/catalogue',
  temporaryWordmark: 'RUN APPAREL',
  footerLine: 'Custom sportswear manufacturer',
  legalLine: '© RUN APPAREL',
  worksCoordinates: '33.5651° N, 73.0169° E',
}

describe('contact parity across hosts (XS-08)', () => {
  it('the site and the viewer resolve the same email and WhatsApp number from the same document', () => {
    const site = mergeSiteSettings(settingsDoc)
    const viewer = buildViewerResponse(product(), [colourway()], settingsDoc, origin, 'navy', deps)!

    expect(viewer.siteSettings.email).toBe(site.email)
    expect(viewer.siteSettings.whatsappNumber).toBe(site.whatsappNumber)
    expect(site.email).toBe(settingsDoc.email)
    expect(site.whatsappNumber).toBe(settingsDoc.whatsappNumber)
  })

  it('the footer reaches both hosts with the same details, the works location included (VA-31)', () => {
    const site = mergeSiteSettings(settingsDoc)
    const viewer = buildViewerResponse(product(), [colourway()], settingsDoc, origin, 'navy', deps)!

    expect(site.footer.worksCoordinates).toBe(settingsDoc.worksCoordinates)
    // The same projection on both sides, so one footer, field for field.
    expect(viewer.siteSettings.footer).toEqual(site.footer)
    expect(viewer.siteSettings.footer?.worksCoordinates).toBe(settingsDoc.worksCoordinates)
  })
})
