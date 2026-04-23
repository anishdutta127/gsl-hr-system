import Link from 'next/link'
import { loadCompany } from '@/lib/company'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const company = loadCompany()
  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-navy focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to main content
      </a>
      <header className="border-b border-line bg-card">
        <div className="container-page flex h-14 items-center justify-between">
          <Link href="/portal/me" className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-5 w-5 rounded bg-teal" />
            <span className="font-display text-base font-semibold text-navy">{company.name}</span>
          </Link>
          <Link href="/careers" className="text-sm text-ink-2 hover:text-ink">
            Open roles
          </Link>
        </div>
      </header>
      <main id="portal-main">{children}</main>
    </div>
  )
}
