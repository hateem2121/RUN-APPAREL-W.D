/**
 * "On this page": a list of a long page's parts, each a link to its heading (polish X4, the
 * privacy and terms pages). Beside the text on a computer, where it stays in view as the page
 * scrolls (site.css, `.legal`); above it on a phone.
 *
 * Plain links to each heading's `id`, so it works with no script, and a heading reached this way
 * lands below the fixed bar (`scroll-padding-top` in site.css). It does not mark the part in view:
 * the CSS for that (`scroll-target-group`, Chrome only in October 2026) still needs a script to
 * tell a screen reader which link is current (modern-web-guidance "scrollspy", 2026-09-04), and
 * the audit asked for the list, not the marker.
 */
export interface PageSection {
  id: string
  title: string
}

export function OnThisPage({ sections }: { sections: readonly PageSection[] }) {
  return (
    <nav className="legal__toc" aria-labelledby="on-this-page">
      <p className="mono legal__toc-label" id="on-this-page">
        On this page
      </p>
      <ol>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
