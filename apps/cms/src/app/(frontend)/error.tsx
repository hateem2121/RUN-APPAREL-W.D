'use client'

import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import Link from 'next/link'

/**
 * The branded crash page for the public site. Until 2026-09-26 there was none, so a page
 * that threw showed Next's unstyled default (audit 2026-09-26). It renders inside the
 * (frontend) layout, so the header and footer stay. `DEFAULT_SITE_SETTINGS`, not the CMS,
 * for the same reason as `not-found.tsx`: this must survive the outage that caused it.
 */
export default function SiteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="site-hero">
      <div className="blueprint site-hero__grid" aria-hidden="true" />
      <div className="site-container">
        <p className="label">[ Error · Something went wrong ]</p>
        <h1 className="display display--hero">
          This page didn&rsquo;t load. <span className="serif-accent">Try&nbsp;again.</span>
        </h1>
        <p className="site-lede">
          Something went wrong on our side, not yours. Trying again usually works; if it does not,
          write to us and we will send what you were looking for.
        </p>
        <div className="site-actions">
          <button className="btn btn--primary" type="button" onClick={() => reset()}>
            Try again
          </button>
          <Link className="btn btn--ghost" href="/products">
            Browse in 3D
          </Link>
        </div>
        <p className="site-lede">
          Or write to us directly:{' '}
          <a className="prose__link" href={`mailto:${DEFAULT_SITE_SETTINGS.email}`}>
            {DEFAULT_SITE_SETTINGS.email}
          </a>
        </p>
      </div>
    </section>
  )
}
