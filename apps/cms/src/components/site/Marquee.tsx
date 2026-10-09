/**
 * A decorative row of words that shifts sideways while the visitor scrolls (BUILD 8.2, the about
 * and factory pages' M1 and FM1, 2026-10-09). A server component: the row is drawn still, and
 * `.marquee` in site.css moves it only on a scroll timeline, inside the site's motion guards, so it
 * never moves on its own (WCAG 2.2.2 needs no pause button for that).
 *
 * ⚠️ HIDDEN FROM SCREEN READERS, AND NEVER THE ONLY PLACE THE WORDS ARE. The same words are real
 * text elsewhere on the page (the category links on /about, the stage list on the factory page);
 * read aloud, the repeated row would be noise.
 *
 * The run repeats four times so no gap shows at any width from 320 to 2560px: the track moves at
 * most a quarter of its length, one run, and one run at the section size is wider than 2560px.
 */
export function Marquee({ words, joiner }: { words: readonly string[]; joiner: string }) {
  const run = `${words.join(` ${joiner} `)} ${joiner} `
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track display display--section">
        {[0, 1, 2, 3].map((copy) => (
          <span className="marquee__run" key={copy}>
            {run}
          </span>
        ))}
      </div>
    </div>
  )
}
