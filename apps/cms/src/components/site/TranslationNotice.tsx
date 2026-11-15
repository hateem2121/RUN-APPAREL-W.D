/**
 * The Russian privacy and terms pages say which text prevails (owner, 2026-11-15: "Yes, add that
 * line"). Both are translations of the English pages, which stay the reference; the line links the
 * English page so a reader can check any wording. A plain `<a>`: the English page has another root
 * layout, so the browser loads it whole either way (LanguageLink.tsx).
 */
export function TranslationNotice({ href }: { href: '/privacy' | '/terms' }) {
  return (
    <p>
      Настоящий текст — перевод. При расхождении между русской и английской версиями
      преимущественную силу имеет{' '}
      <a href={href} hrefLang="en">
        английская версия
      </a>
      .
    </p>
  )
}
