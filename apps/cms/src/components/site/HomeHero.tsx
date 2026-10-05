import Link from 'next/link'
import { FACTS } from '../../lib/companyFacts'
import { HERO_PHOTO, heroPhotoSrc } from '../../lib/factoryPhotos'

/**
 * The home page's first screen, over the stitching floor (owner, 2026-09-29: "Factory photo").
 *
 * ⚠️ THE HERO IS SET IN THE DARK SCHEME, WHATEVER THE PAGE'S THEME. `.site-hero--photo` carries
 * `color-scheme: dark`, so every `light-dark()` token inside it resolves to its dark value —
 * paper-white text and the volt headline over an ink wash — in both themes, with no colour
 * the palette does not already have. Light-theme ink text over a photograph would need its own
 * contrast work per photo; this needs none.
 *
 * ⚠️ THE PHOTO IS THE PAGE'S LARGEST PAINT, so it is eager with `fetchPriority="high"` on the
 * `<img>` (never a `<link rel=preload>`: `e2e/perfBudgets.spec.ts` pins one preload per page).
 * Two crops: 4:5 for phones, 16:9 for everything wider (`lib/factoryPhotos.ts`).
 *
 * The label is the owner's choice of 2026-09-29, researched: a founding year signals quality,
 * and a low first order lowers the risk of asking — "since 1889" plus "start from 50".
 */
const minimum = FACTS.find((fact) => fact.label.startsWith('Minimum'))?.value ?? ''

export function HomeHero() {
  const [tall640, tall1080] = HERO_PHOTO.widths.heroTall
  const [wide1280, wide1920, wide2560] = HERO_PHOTO.widths.heroWide
  return (
    <section className="site-hero site-hero--photo">
      <picture className="site-hero__photo">
        <source
          type="image/avif"
          media="(max-width: 700px)"
          srcSet={`${heroPhotoSrc('heroTall', tall640, 'avif')} ${tall640}w, ${heroPhotoSrc('heroTall', tall1080, 'avif')} ${tall1080}w`}
          sizes="100vw"
          width={tall640}
          height={Math.round(tall640 / HERO_PHOTO.aspect.heroTall)}
        />
        <source
          media="(max-width: 700px)"
          srcSet={`${heroPhotoSrc('heroTall', tall640)} ${tall640}w, ${heroPhotoSrc('heroTall', tall1080)} ${tall1080}w`}
          sizes="100vw"
          width={tall640}
          height={Math.round(tall640 / HERO_PHOTO.aspect.heroTall)}
        />
        {/* A plain <img>: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why); the crops are pre-built files, picked by srcSet. */}
        <img
          className="site-hero__img"
          src={heroPhotoSrc('heroWide', wide1280)}
          srcSet={`${heroPhotoSrc('heroWide', wide1280)} ${wide1280}w, ${heroPhotoSrc('heroWide', wide1920)} ${wide1920}w, ${heroPhotoSrc('heroWide', wide2560)} ${wide2560}w`}
          sizes="100vw"
          width={wide1280}
          height={Math.round(wide1280 / HERO_PHOTO.aspect.heroWide)}
          alt={HERO_PHOTO.alt}
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </picture>
      <div className="blueprint site-hero__grid" aria-hidden="true" />
      <div className="site-container">
        {/*
          ONE SENTENCE IN TWO HALVES (VA-43, 2026-10-02): the dot between them is its own span so
          a phone can drop it and give the second half a line (site.css). The text, spaces
          included, is exactly what it was: `HomeHero.test.ts` holds it.
        */}
        <p className="label">
          [ Private label manufacturer since 1889<span className="label__dot"> · </span>
          <span className="label__tail">Start from {minimum} pieces per style ]</span>
        </p>
        <h1 className="display display--hero">
          Made to order. <span className="serif-accent">Made&nbsp;properly.</span>
        </h1>
        <p className="site-lede">
          RUN APPAREL is a private label manufacturer in Sialkot — team wear, active wear, casual
          wear, outerwear and sports accessories, made to order for the brands, teams and
          organizations that never look back.
        </p>
        <div className="site-actions">
          <Link className="btn btn--primary" href="/contact#inquiry">
            Start a conversation
          </Link>
          <Link className="btn btn--ghost" href="/products">
            Browse in 3D
          </Link>
        </div>
      </div>
    </section>
  )
}
