import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'

/**
 * Seed dataset: product N001 "Velocity Performance Tee" with three
 * colourways, wired to demonstrate BOTH variant modes:
 *
 * - published as `single-glb-variants` with the pipeline-merged GLB
 *   (variants N001-NAVY / N001-BLACK / N001-CRIMSON), and
 * - each colourway also carries its own per-colour GLB, so switching the
 *   product to `separate-glb-per-colour` in the admin works immediately.
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
  variantId: string
  hexSwatch: string
  sequence: number
  isDefault: boolean
}

const COLOURWAYS: SeedColourway[] = [
  { slug: 'navy', displayName: 'Navy', variantId: 'N001-NAVY', hexSwatch: '#22314E', sequence: 1, isDefault: true },
  { slug: 'black', displayName: 'Black', variantId: 'N001-BLACK', hexSwatch: '#17181A', sequence: 2, isDefault: false },
  { slug: 'crimson', displayName: 'Crimson', variantId: 'N001-CRIMSON', hexSwatch: '#8C1F2F', sequence: 3, isDefault: false },
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

  // ── Admin user (development convenience) ─────────────────────────────
  const users = await payload.find({ collection: 'users', limit: 1, depth: 0 })
  if (users.docs.length === 0) {
    await payload.create({
      collection: 'users',
      data: {
        email: process.env.SEED_ADMIN_EMAIL ?? 'admin@wear-run.help',
        password: process.env.SEED_ADMIN_PASSWORD ?? 'run-apparel-dev-only',
        name: 'RUN Admin',
        role: 'admin',
      },
    })
    payload.logger.warn(
      'Seed: created dev admin user (admin@wear-run.help / run-apparel-dev-only). CHANGE THIS PASSWORD before any real deployment.',
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
      data: { alt: `Velocity Performance Tee in ${colourway.displayName}, front three-quarter view` },
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

  // ── Product (draft first — publish after colourways exist) ───────────
  const product = await payload.create({
    collection: 'products',
    data: {
      productCode: 'N001',
      slug: 'n001',
      productName: 'Velocity Performance Tee',
      category: 'Sportswear',
      status: 'draft',
      variantMode: 'single-glb-variants',
      variantsVerified: true,
      presentationMode: 'floatingGarment',
      glbAsset: mergedGlbMedia.id,
      posterFallback: posterIds['navy'],
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

  let defaultColourwayId: number | null = null
  for (const colourway of COLOURWAYS) {
    const created = await payload.create({
      collection: 'colourways',
      data: {
        product: product.id,
        variantId: colourway.variantId,
        displayName: colourway.displayName,
        slug: colourway.slug,
        sequence: colourway.sequence,
        posterPreview: posterIds[colourway.slug]!,
        glbAsset: colourGlbIds[colourway.slug]!,
        active: true,
        isDefault: colourway.isDefault,
        altText: `Velocity Performance Tee in ${colourway.displayName}`,
        hexSwatch: colourway.hexSwatch,
      },
    })
    if (colourway.isDefault) defaultColourwayId = created.id
  }

  await payload.update({
    collection: 'products',
    id: product.id,
    data: { defaultColourway: defaultColourwayId, status: 'published' },
  })

  payload.logger.info(
    'Seed complete: N001 published as single-glb-variants; per-colour GLBs attached so separate-glb-per-colour also works. Try /api/public/viewer/n001/navy',
  )
}
