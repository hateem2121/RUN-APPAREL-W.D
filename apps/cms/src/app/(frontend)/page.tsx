import Link from 'next/link'

// The CMS worker has no public pages — this root simply points staff at the admin.
export default function Home() {
  return (
    <main style={{ fontFamily: 'ui-monospace, monospace', padding: '4rem 2rem', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: '1rem', letterSpacing: '0.1em' }}>
        RUN APPAREL — CONTENT ADMINISTRATION
      </h1>
      <p>
        This service is private. Staff: <Link href="/admin">log in to the admin panel</Link>.
      </p>
    </main>
  )
}
