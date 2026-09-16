/**
 * The company's postal address, in ONE place for both surfaces.
 *
 * It lived in `apps/cms/src/lib/structuredData.ts` until the 3D pages needed it too: they
 * are where most visitors arrive, from a QR tag on a garment, and they now print it in
 * their footer. Two copies of an address drift, and the apps may not import each other
 * (biome.jsonc → noRestrictedImports), so it lives in the package both already depend on.
 */
export const POSTAL_ADDRESS = {
  street: '13 Km Daska Road',
  locality: 'Sialkot',
  postalCode: '51040',
  country: 'PK',
} as const

/** The same address as one line, for display. */
export function formatAddress(): string {
  const { street, locality, postalCode } = POSTAL_ADDRESS
  return `${street}, ${locality}, ${postalCode}, Pakistan`
}
