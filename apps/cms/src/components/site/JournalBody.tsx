import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { type JSXConvertersFunction, RichText } from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'
import { publicImage, richTextHref } from '../../lib/journalPublic'
import { ArticleImage } from './ArticleParts'

/**
 * A Journal post's body, from the CMS editor's Lexical document to plain server-rendered
 * elements (PLAN.md E6). `RichText` from `@payloadcms/richtext-lexical/react` (Payload docs,
 * "Converting JSX", read 2026-10-07) with three converters of our own, and no raw HTML string
 * set into the page anywhere:
 *
 * - links, both kinds: `LinkJSXConverter` writes whatever address was typed, so a `javascript:`
 *   link would reach the page. `richTextHref` keeps web, mail, phone and on-site addresses only,
 *   turns a link to another post into its address, and draws the words alone otherwise. A link
 *   that opens a new tab gets `noopener noreferrer`.
 * - pictures: the default converter writes the admin's media host and no `loading`; this one
 *   writes the site's media host, the measured size and `loading="lazy"`, or nothing for a file
 *   a visitor could not load (`publicImage`).
 */
const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  link: ({ node, nodesToJSX }) => {
    const children = nodesToJSX({ nodes: node.children })
    const href = richTextHref(node.fields)
    if (!href) return <>{children}</>
    if (href.startsWith('/')) return <Link href={href}>{children}</Link>
    return node.fields?.newTab ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <a href={href}>{children}</a>
    )
  },
  autolink: ({ node, nodesToJSX }) => {
    const children = nodesToJSX({ nodes: node.children })
    const href = richTextHref(node.fields)
    return href ? <a href={href}>{children}</a> : <>{children}</>
  },
  upload: ({ node }) => {
    const image = publicImage((node as { value?: unknown }).value)
    if (!image) return null
    return (
      <figure className="journal-body__figure">
        <ArticleImage
          image={image}
          className="journal-body__img"
          sizes="(max-width: 899px) calc(100vw - 40px), 720px"
        />
      </figure>
    )
  },
})

export function JournalBody({ body }: { body: unknown }) {
  if (!body || typeof body !== 'object' || !('root' in body)) return null
  return (
    <RichText
      className="journal-body prose prose--guide"
      converters={converters}
      data={body as SerializedEditorState}
    />
  )
}
