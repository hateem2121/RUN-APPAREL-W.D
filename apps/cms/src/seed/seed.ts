import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'

/**
 * Seed dataset: product N001 "Velocity Performance Tee" with three colours,
 * wired to demonstrate BOTH variant modes:
 *
 * - published as `single-glb-variants` with the pipeline-merged GLB
 *   (variants N001-NAVY / N001-BLACK / N001-CRIMSON), and
 * - each colour also carries its own per-colour GLB, so switching the product
 *   to `separate-glb-per-colour` in the admin works immediately.
 *
 * Colours are now an inline array on the product, so this is a single create
 * rather than a product + a loop of colourway documents + a back-patch to point
 * the product at its default.
 *
 * `fileColours` is seeded to what `pnpm seed:assets` actually bakes into the
 * merged GLB. That is not decoration: the publish gate derives "colours checked"
 * by testing each colour's `variantId` against this list, so without it the seed
 * would refuse to publish.
 *
 * Prerequisite: `pnpm seed:assets` (generates placeholders + merged GLB).
 */

const paragraph = (text: string) => ({
  type: 'paragraph',
  format: '' as const,
  indent: 0,
  version: 1,
  direction: 'ltr' as const,
  children: [{ type: 'text', text, detail: 0, format: 0, mode: 'normal', style: '', version: 1 }],
})

const lexical = (texts: string[]) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: texts.map(paragraph),
  },
})

interface SeedColourway {
  slug: string
  displayName: string
  /** The variant's name inside the merged GLB, as `pnpm seed:assets` binds it. */
  variantId: string
  hexSwatch: string
}

/**
 * ⚠️ THIS LIST MUST MATCH `PLACEHOLDER_COLOURWAYS` IN
 * `tools/asset-pipeline/src/placeholders.ts`, AND IT DID NOT FOR WEEKS.
 *
 * It said navy / black / crimson with variant ids `N001-NAVY` and `N001-CRIMSON`, while
 * `pnpm seed:assets` has generated wine / blush / butter / lime / black since commit
 * bc723f7 ("the seeded garment now has five colourways, because production does"). That
 * commit changed the pipeline and left this file behind.
 *
 * The consequence was not cosmetic: `pnpm seed:cms` — step three of the documented
 * first-run in `docs/ONBOARDING.md` — DIED on a clean checkout, looking for
 * `n001-navy-poster.webp`, a file nothing generates. Two of the three variant ids also
 * matched no variant inside the merged GLB, so even a hand-fixed poster would have bound
 * nothing. Nobody noticed because a developer seeds once and CI never ran this at all.
 *
 * `seedColourways.test.ts` reads the pipeline's constant and fails the moment the two
 * disagree again. Array ORDER is the colourway order, and the first is the default —
 * wine, which is what `apps/viewer/e2e` already fixtures as `/n001/wine`.
 *
 * `hexSwatch` is the pipeline's `body` colour: the swatch shows the garment's cloth, not
 * its trim or its print.
 */
const COLOURWAYS: SeedColourway[] = [
  { slug: 'wine', displayName: 'Wine', variantId: 'N001-WINE', hexSwatch: '#825353' },
  { slug: 'blush', displayName: 'Blush', variantId: 'N001-BLUSH', hexSwatch: '#F7CDCD' },
  { slug: 'butter', displayName: 'Butter', variantId: 'N001-BUTTER', hexSwatch: '#FDFDC8' },
  { slug: 'lime', displayName: 'Lime', variantId: 'N001-LIME', hexSwatch: '#D6F26B' },
  { slug: 'black', displayName: 'Black', variantId: 'N001-BLACK', hexSwatch: '#262727' },
]

export async function seed(payload: Payload, assetsDir: string): Promise<void> {
  const placeholderDir = path.join(assetsDir, 'placeholders')
  const mergedGlb = path.join(assetsDir, 'n001.glb')
  if (!existsSync(mergedGlb) || !existsSync(placeholderDir)) {
    throw new Error(
      `Seed assets not found under ${assetsDir}.\nRun "pnpm seed:assets" from the repo root first (generates placeholder GLBs/posters and the merged production GLB).`,
    )
  }

  const existing = await payload.find({
    collection: 'products',
    where: { slug: { equals: 'n001' } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs.length > 0) {
    payload.logger.info('Seed: product n001 already exists — nothing to do.')
    return
  }

  // ── Site settings ────────────────────────────────────────────────────
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      companyName: 'RUN APPAREL (PVT) LTD',
      email: 'partner@wear-run.com',
      whatsappNumber: '+923361777313',
      catalogueUrl: 'https://wear-run.help/catalogue',
      temporaryWordmark: 'RUN APPAREL',
      footerLine: 'RUN THE EXTRA MILE.',
      legalLine: '© RUN APPAREL (PVT) LTD',
    },
  })

  // ── Admin user ───────────────────────────────────────────────────────
  // Create an admin ONLY when credentials are explicitly provided, or when the
  // known-password dev admin is explicitly opted into (SEED_DEV_ADMIN=1, set by
  // the local `seed` script). This guarantees the dev admin can never be created
  // against production — there, create the first admin via the Payload
  // first-user screen at /admin instead.
  const explicitEmail = process.env.SEED_ADMIN_EMAIL
  const explicitPassword = process.env.SEED_ADMIN_PASSWORD
  const allowDevAdmin = process.env.SEED_DEV_ADMIN === '1'
  const users = await payload.find({ collection: 'users', limit: 1, depth: 0 })
  if (users.docs.length === 0 && (explicitPassword || allowDevAdmin)) {
    await payload.create({
      collection: 'users',
      data: {
        email: explicitEmail ?? 'admin@wear-run.help',
        password: explicitPassword ?? 'run-apparel-dev-only',
        name: 'RUN Admin',
        role: 'admin',
      },
    })
    payload.logger.warn(
      explicitPassword
        ? `Seed: created admin ${explicitEmail ?? 'admin@wear-run.help'} from SEED_ADMIN_* env.`
        : 'Seed: created DEV admin (admin@wear-run.help / run-apparel-dev-only) — LOCAL USE ONLY, never production.',
    )
  } else if (users.docs.length === 0) {
    payload.logger.info(
      'Seed: no admin created. Set SEED_ADMIN_EMAIL+SEED_ADMIN_PASSWORD (or SEED_DEV_ADMIN=1 for the local dev admin), or create the first admin at /admin.',
    )
  }

  // ── Media ────────────────────────────────────────────────────────────
  const mergedGlbMedia = await payload.create({
    collection: 'media',
    data: { alt: 'Velocity Performance Tee — merged production 3D model (all colourways)' },
    filePath: mergedGlb,
  })

  const posterIds: Record<string, number> = {}
  const colourGlbIds: Record<string, number> = {}
  for (const colourway of COLOURWAYS) {
    const poster = await payload.create({
      collection: 'media',
      data: {
        alt: `Velocity Performance Tee in ${colourway.displayName}, front three-quarter view`,
      },
      filePath: path.join(placeholderDir, `n001-${colourway.slug}-poster.webp`),
    })
    posterIds[colourway.slug] = poster.id
    const glb = await payload.create({
      collection: 'media',
      data: { alt: `Velocity Performance Tee in ${colourway.displayName} — 3D model` },
      filePath: path.join(placeholderDir, `n001-${colourway.slug}.glb`),
    })
    colourGlbIds[colourway.slug] = glb.id
  }

  // ── Product ──────────────────────────────────────────────────────────
  // One create, published outright. The old two-phase dance (save as draft →
  // create the colourway documents → patch the product's default → publish)
  // existed only because colourways needed a product id to point at. They
  // arrive with the document now, so the publish gate can check everything in
  // a single pass.
  await payload.create({
    collection: 'products',
    data: {
      productCode: 'N001',
      slug: 'n001',
      productName: 'Velocity Performance Tee',
      category: 'Sportswear',
      status: 'published',
      variantMode: 'single-glb-variants',
      glbAsset: mergedGlbMedia.id,
      // What the merged GLB really contains — see the note at the top.
      fileColours: COLOURWAYS.map((c) => c.variantId),
      colourways: COLOURWAYS.map((colourway) => ({
        displayName: colourway.displayName,
        slug: colourway.slug,
        variantId: colourway.variantId,
        posterPreview: posterIds[colourway.slug]!,
        glbAsset: colourGlbIds[colourway.slug]!,
        active: true,
        // Deliberately CONSISTENT with productName above — and that consistency
        // is why this fixture could never have exhibited M2, where the live
        // product served six labels naming the garment it used to be called.
        // The failing case lives in publishGating.test.ts, with the real strings.
        altText: `Velocity Performance Tee in ${colourway.displayName}`,
        hexSwatch: colourway.hexSwatch,
      })),
      posterFallback: posterIds.navy,
      fabricComposition: 'Recycled polyester / elastane',
      gsm: '160 GSM',
      performanceFeatures: [
        { feature: 'Moisture management' },
        { feature: 'Four-way stretch' },
        { feature: 'Quick-dry handle' },
      ],
      garmentFit: 'Athletic regular',
      customisationIntro: lexical([
        'Send us a finished design, a tech pack, artwork, a reference image — or simply an idea. Our team develops it with you into a production-ready garment.',
      ]),
      customisationSteps: [
        {
          number: 1,
          title: 'SHARE YOUR STARTING POINT',
          body: 'A finished design, a tech pack, artwork, a reference image, or simply an idea — every project starts from wherever you are.',
        },
        {
          number: 2,
          title: 'DEFINE THE PRODUCT',
          body: 'Together we lock the fabric, colour, fit, trims and performance details around your brief.',
        },
        {
          number: 3,
          title: 'ADD YOUR BRAND',
          body: 'Logos, labels, prints, embroidery and finishing are developed to carry your identity.',
        },
        {
          number: 4,
          title: 'SAMPLE, REFINE AND PRODUCE',
          body: 'You approve a development sample, we refine it together, and production follows the approved standard.',
        },
      ],
      frontCameraOrbit: '0deg 82deg 105%',
      backCameraOrbit: '180deg 82deg 105%',
      sideCameraOrbit: '90deg 82deg 105%',
      cameraTarget: 'auto auto auto',
      defaultFieldOfView: '30deg',
      catalogueUrl: 'https://wear-run.help/catalogue',
      sortOrder: 1,
      retiredMessage:
        'The colourway linked by this QR is no longer active. You are viewing the current available reference.',
    },
  })

  payload.logger.info(
    `Seed complete: N001 published as single-glb-variants with ${COLOURWAYS.length} inline colours; per-colour GLBs attached so separate-glb-per-colour also works. Try /api/public/viewer/n001/${COLOURWAYS[0]?.slug}`,
  )
}
