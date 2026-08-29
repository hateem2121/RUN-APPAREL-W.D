declare module 'gltf-validator' {
  /** 0 = Error, 1 = Warning, 2 = Info, 3 = Hint. */
  export type GltfIssueSeverity = 0 | 1 | 2 | 3

  export interface GltfIssueMessage {
    /** Stable identifier, e.g. `ACCESSOR_INDEX_OOB`. Match on this, never the prose. */
    code: string
    message: string
    severity: GltfIssueSeverity
    /** JSON pointer into the glTF, e.g. `/meshes/0/primitives/0/material`. */
    pointer?: string
    offset?: number
  }

  export interface GltfValidationReport {
    /** The validator's own version, e.g. `2.0.0-dev.3.10`. */
    validatorVersion: string
    issues: {
      numErrors: number
      numWarnings: number
      numInfos: number
      numHints: number
      messages: GltfIssueMessage[]
      /** True when `maxIssues` cut the list short — a count without its messages. */
      truncated: boolean
    }
  }

  export interface GltfValidationOptions {
    maxIssues?: number
    /** Issue codes to drop before counting. See SPEC_NOISE in gltf-spec.ts. */
    ignoredIssues?: string[]
    /** Called for any resource not embedded in the file. A GLB should never need it. */
    externalResourceFunction?: (uri: string) => Promise<Uint8Array>
  }

  export function validateBytes(
    data: Uint8Array,
    options?: GltfValidationOptions,
  ): Promise<GltfValidationReport>
  export function validateString(
    json: string,
    options?: GltfValidationOptions,
  ): Promise<GltfValidationReport>
  export function version(): string
  export function supportedExtensions(): string[]

  const validator: {
    validateBytes: typeof validateBytes
    validateString: typeof validateString
    version: typeof version
    supportedExtensions: typeof supportedExtensions
  }
  export default validator
}
