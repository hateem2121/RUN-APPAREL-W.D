/**
 * Render a structured-data block.
 *
 * ⚠️ THE `<` ESCAPE IS SECURITY, NOT TIDINESS. Serialised JSON goes inside a `<script>`
 * element, and the HTML parser ends that element at the first literal `</script>` —
 * inside a string or not. Any CMS value containing that sequence would close the script
 * early and turn the remainder of the JSON into live markup. Escaping `<` to `<`
 * is still valid JSON, parses identically, and makes the sequence unrepresentable.
 *
 * The data always comes from `lib/structuredData.ts`, which builds plain objects from
 * settings and product rows — never from user-supplied HTML.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the only way to emit a JSON-LD block; the payload is JSON.stringify of a locally-built object with `<` escaped, per the comment above.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
