import Link from 'next/link'
import { loadCompany } from '@/lib/company'

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  const company = loadCompany()
  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-navy focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to main content
      </a>
      <header className="border-b border-line bg-card">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href="/careers" className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-6 w-6 rounded bg-teal" />
            <span className="font-display text-lg font-semibold text-navy">{company.name}</span>
            <span className="hidden text-sm text-ink-2 sm:inline">· {company.tagline}</span>
          </Link>
          <Link
            href="/login"
            className="text-sm text-ink-2 hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:underline"
          >
            Staff sign in
          </Link>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="mt-20 border-t border-line bg-card">
        <div className="container-page py-10 text-sm text-ink-2">
          <p>
            {company.name} is part of {company.parentGroup}. Building EdTech products for India.
          </p>
          <p className="mt-2 text-xs text-ink-3">
            Questions? Write to{' '}
            <a href={`mailto:${company.hrContact.email}`} className="underline">
              {company.hrContact.email}
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  )
}
