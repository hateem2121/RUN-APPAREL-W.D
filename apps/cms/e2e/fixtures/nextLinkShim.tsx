import type { AnchorHTMLAttributes, ReactNode } from 'react'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  prefetch?: boolean
  children?: ReactNode
}

/**
 * `next/link` for the e2e harnesses, which draw the site's components outside a Next app. Next's
 * Link renders this same `<a href>`; outside the app it has no router to prefetch with.
 * `productsGroupsHarness.ts` swaps it in.
 */
export default function Link({ href, prefetch: _prefetch, children, ...rest }: LinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}
