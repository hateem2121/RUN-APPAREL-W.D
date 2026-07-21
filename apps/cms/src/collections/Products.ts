import { isValidProductCode, isValidSlug } from '@run-apparel/shared'
import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor, isAuthenticated } from '../access/roles'
import { cameraFields } from '../fields/camera'

export const DEFAULT_RETIRED_MESSAGE =
  'The colourway linked by this QR is no longer active. You are viewing the current available reference.'

export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'productName',
    defaultColumns: ['productCode', 'productName', 'category', 'status', 'variantMode'],
    group: 'Content',
  },
  access: {
    // Anonymous visitors read only through the dedicated public viewer endpoint.
    read: isAuthenticated,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        const status = data?.status ?? originalDoc?.status
        if (status !== 'published') return data

        const id = originalDoc?.id
        // Publishing rules below (at least one active colourway, exactly one
        // default, per-colourway GLB coverage, variantId prefixes) can only be
        // checked once the product has an ID and colourways can reference it.
        // Block publishing on create so those checks are never silently skipped.
        if (!id) {
          throw new Error(
            'Save this product as a draft first, add its colourways, then set it to Published. ' +
              'Publishing checks need the product to exist before its colourways can be verified.',
          )
        }
        const productCode = data?.productCode ?? originalDoc?.productCode
        const variantMode = data?.variantMode ?? originalDoc?.variantMode
        const glbAsset = data?.glbAsset ?? originalDoc?.glbAsset
        const variantsVerified = data?.variantsVerified ?? originalDoc?.variantsVerified
        const defaultColourway = data?.defaultColourway ?? originalDoc?.defaultColourway

        if (!defaultColourway) {
          throw new Error('A published product needs a default colourway. Select one before publishing.')
        }

        if (variantMode === 'single-glb-variants') {
          if (!glbAsset) {
            throw new Error(
              'Published "single GLB with variants" products need a merged production GLB. Upload the pipeline-processed GLB, or switch to "separate GLB per colourway".',
            )
          }
          if (!variantsVerified) {
            throw new Error(
              'Tick "Variants verified" after confirming availableVariants matches every colourway variantId (pnpm pipeline validate). Required before publishing in single-GLB mode.',
            )
          }
        }

        if (id) {
          const colourways = await req.payload.find({
            collection: 'colourways',
            where: { product: { equals: id } },
            limit: 200,
            depth: 0,
            req,
          })
          const active = colourways.docs.filter((c) => c.active)
          if (active.length === 0) {
            throw new Error('A published product needs at least one active colourway.')
          }
          const defaults = active.filter((c) => c.isDefault)
          if (defaults.length !== 1) {
            throw new Error(
              `A published product must have exactly one default active colourway (found ${defaults.length}). Fix the colourways before publishing.`,
            )
          }
          const defaultId = typeof defaultColourway === 'object' ? defaultColourway?.id : defaultColourway
          if (defaults[0]!.id !== defaultId) {
            throw new Error(
              'The product’s "default colourway" must be the colourway marked as active default.',
            )
          }
          if (variantMode === 'separate-glb-per-colour') {
            const missing = active.filter((c) => !c.glbAsset)
            if (missing.length > 0) {
              throw new Error(
                `In "separate GLB per colourway" mode every active colourway needs its own GLB. Missing: ${missing
                  .map((c) => c.variantId)
                  .join(', ')}.`,
              )
            }
          }
          for (const colourway of colourways.docs) {
            if (productCode && !String(colourway.variantId).startsWith(`${productCode}-`)) {
              throw new Error(
                `Colourway ${colourway.variantId} does not start with the product code ${productCode}-.`,
              )
            }
          }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'productCode',
      type: 'text',
      required: true,
      unique: true,
      validate: (value: unknown) =>
        typeof value === 'string' && isValidProductCode(value)
          ? true
          : 'Product code must be uppercase letters/digits starting with a letter, e.g. N001.',
      admin: { description: 'Unique uppercase code, e.g. N001.' },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: (value: unknown) =>
        typeof value === 'string' && isValidSlug(value)
          ? true
          : 'Slug must be lowercase URL-safe, e.g. n001.',
      admin: { description: 'URL segment: viewer.wear-run.help/<slug>/<colour>.' },
    },
    {
      name: 'productName',
      type: 'text',
      required: true,
      admin: { description: 'Buyer-friendly name, e.g. Velocity Performance Tee.' },
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Sportswear', value: 'Sportswear' },
        { label: 'Teamwear & Uniforms', value: 'Teamwear & Uniforms' },
        { label: 'Casual Wear', value: 'Casual Wear' },
        { label: 'Outerwear', value: 'Outerwear' },
        { label: 'Sports Accessories', value: 'Sports Accessories' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'variantMode',
      type: 'select',
      required: true,
      defaultValue: 'single-glb-variants',
      options: [
        { label: 'Single GLB with material variants', value: 'single-glb-variants' },
        { label: 'Separate GLB per colourway', value: 'separate-glb-per-colour' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Use "separate GLB per colourway" whenever the merged multi-variant GLB fails, looks wrong, or is not processed yet — publishing must never be blocked.',
      },
    },
    {
      name: 'variantsVerified',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        condition: (data) => data?.variantMode === 'single-glb-variants',
        description:
          'Manually verified that the merged GLB’s availableVariants exactly matches the colourway variantIds (asset pipeline "validate" + scenegraph check). Required to publish.',
      },
    },
    {
      name: 'defaultColourway',
      type: 'relationship',
      relationTo: 'colourways',
      admin: {
        position: 'sidebar',
        description: 'The active colourway shown when a QR link’s colourway is retired or missing.',
      },
      filterOptions: ({ id }) => (id ? { product: { equals: id } } : false),
    },
    {
      name: 'presentationMode',
      type: 'select',
      required: true,
      defaultValue: 'floatingGarment',
      options: [
        { label: 'Floating garment', value: 'floatingGarment' },
        { label: 'Invisible mannequin', value: 'invisibleMannequin' },
      ],
    },
    {
      name: 'glbAsset',
      type: 'upload',
      relationTo: 'media',
      admin: {
        condition: (data) => data?.variantMode === 'single-glb-variants',
        description:
          'The merged production GLB from the asset pipeline (all colourways bound as KHR_materials_variants). Never a raw CLO export.',
      },
    },
    {
      name: 'posterFallback',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Static render shown instantly and used when 3D cannot load.',
      },
    },
    { name: 'fabricComposition', type: 'text', admin: { description: 'e.g. Recycled polyester / elastane.' } },
    { name: 'gsm', type: 'text', admin: { description: 'e.g. 160 GSM.' } },
    {
      name: 'performanceFeatures',
      type: 'array',
      admin: { description: 'Short technical phrases, e.g. "Moisture management".' },
      fields: [{ name: 'feature', type: 'text', required: true }],
    },
    { name: 'garmentFit', type: 'text', admin: { description: 'e.g. Athletic regular.' } },
    {
      name: 'customisationIntro',
      type: 'richText',
      admin: {
        description: 'Shown in the customisation section. B2B/OEM language only — no retail wording.',
      },
    },
    {
      name: 'customisationSteps',
      type: 'array',
      admin: { description: 'The "How we build your product" steps.' },
      fields: [
        { name: 'number', type: 'number', required: true },
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'textarea', required: true },
      ],
    },
    ...cameraFields,
    {
      name: 'catalogueUrl',
      type: 'text',
      required: true,
      defaultValue: 'https://wear-run.help/catalogue',
      validate: (value: unknown) => {
        if (typeof value !== 'string') return 'Catalogue URL is required.'
        try {
          new URL(value)
          return true
        } catch {
          return 'Catalogue URL must be a valid absolute URL.'
        }
      },
    },
    { name: 'sortOrder', type: 'number', defaultValue: 0, admin: { position: 'sidebar' } },
    {
      name: 'retiredMessage',
      type: 'text',
      required: true,
      defaultValue: DEFAULT_RETIRED_MESSAGE,
      admin: {
        description: 'Shown when a scanned QR points at a colourway that is no longer active.',
      },
    },
  ],
}
