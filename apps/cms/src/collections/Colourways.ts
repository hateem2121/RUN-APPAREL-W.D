import { isValidSlug, isValidVariantId } from '@run-apparel/shared'
import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor, isAuthenticated } from '../access/roles'

const relationId = (value: unknown): number | string | null => {
  if (value == null) return null
  if (typeof value === 'object' && 'id' in value) return (value as { id: number | string }).id
  return value as number | string
}

export const Colourways: CollectionConfig = {
  slug: 'colourways',
  admin: {
    useAsTitle: 'variantId',
    defaultColumns: ['variantId', 'displayName', 'sequence', 'active', 'isDefault'],
    group: 'Content',
  },
  access: {
    read: isAuthenticated,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        const productId = relationId(data?.product ?? originalDoc?.product)
        if (!productId) throw new Error('A colourway must belong to a product.')

        const product = await req.payload.findByID({
          collection: 'products',
          id: productId,
          depth: 0,
          req,
        })

        const variantId = (data?.variantId ?? originalDoc?.variantId) as string | undefined
        if (!variantId || !isValidVariantId(variantId, String(product.productCode))) {
          throw new Error(
            `Variant ID must start with the parent product code plus hyphen, e.g. ${product.productCode}-NAVY.`,
          )
        }

        // No duplicate colourway slugs within one product.
        const slug = (data?.slug ?? originalDoc?.slug) as string | undefined
        if (slug) {
          const clash = await req.payload.find({
            collection: 'colourways',
            where: {
              and: [{ product: { equals: productId } }, { slug: { equals: slug } }],
            },
            limit: 5,
            depth: 0,
            req,
          })
          if (clash.docs.some((doc) => doc.id !== originalDoc?.id)) {
            throw new Error(`Another colourway of this product already uses the slug "${slug}".`)
          }
        }

        // Guard: don’t deactivate the default colourway of a published product.
        const willBeActive = data?.active ?? originalDoc?.active ?? true
        const wasDefault = Boolean(originalDoc?.isDefault)
        const willBeDefault = data?.isDefault ?? wasDefault
        if (product.status === 'published' && wasDefault && (!willBeActive || !willBeDefault)) {
          throw new Error(
            'This colourway is the default of a published product. Mark another active colourway as default first.',
          )
        }
        return data
      },
    ],
    afterChange: [
      // Keep "exactly one default" workable: marking a colourway default
      // un-marks its siblings automatically.
      async ({ doc, req, context }) => {
        if (context?.skipDefaultSync) return
        if (!doc.isDefault) return
        const productId = relationId(doc.product)
        if (!productId) return
        const siblings = await req.payload.find({
          collection: 'colourways',
          where: {
            and: [{ product: { equals: productId } }, { isDefault: { equals: true } }],
          },
          limit: 50,
          depth: 0,
          req,
        })
        for (const sibling of siblings.docs) {
          if (sibling.id === doc.id) continue
          await req.payload.update({
            collection: 'colourways',
            id: sibling.id,
            data: { isDefault: false },
            context: { skipDefaultSync: true },
            req,
          })
        }
      },
    ],
  },
  fields: [
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
    },
    {
      name: 'variantId',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description:
          'Structured ID, e.g. N001-NAVY. Must exactly match the KHR_materials_variants name inside the merged GLB (single-GLB mode).',
      },
    },
    { name: 'displayName', type: 'text', required: true, admin: { description: 'e.g. Navy.' } },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      validate: (value: unknown) =>
        typeof value === 'string' && isValidSlug(value)
          ? true
          : 'Slug must be lowercase URL-safe, e.g. navy.',
      admin: { description: 'URL segment: viewer.wear-run.help/<product>/<slug>. Printed in QR codes — never change it once QRs are in the field; retire the colourway instead.' },
    },
    { name: 'sequence', type: 'number', required: true, defaultValue: 1, admin: { description: 'Tab order: 01, 02, 03…' } },
    {
      name: 'posterPreview',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: { description: 'Static CLO front three-quarter render. Shows instantly while 3D loads.' },
    },
    {
      name: 'glbAsset',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'This colourway’s own GLB — used only when the parent product’s variant mode is "separate GLB per colourway". Still must be pipeline-validated.',
      },
    },
    { name: 'active', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar', description: 'Inactive colourways disappear from the viewer; QR links to them fall back to the default colourway.' } },
    { name: 'isDefault', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Exactly one active colourway per product. Marking this un-marks the others.' } },
    {
      name: 'altText',
      type: 'text',
      required: true,
      admin: { description: 'Accessible description, e.g. "Velocity Performance Tee in Navy".' },
    },
    {
      name: 'hexSwatch',
      type: 'text',
      validate: (value: unknown) =>
        value == null || value === '' || (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value))
          ? true
          : 'Hex swatch must look like #22314E.',
      admin: { description: 'Admin recognition only — never the sole visual selector on the viewer.' },
    },
    { name: 'note', type: 'textarea', admin: { description: 'Internal note (never shown publicly).' } },
  ],
}
