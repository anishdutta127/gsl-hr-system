import Link from 'next/link'
import { getCurrentSession } from '@/lib/identity'
import { LogoutButton } from './LogoutButton'
import { SidebarNav } from './SidebarNav'
import { SyncNowButton } from './SyncNowButton'

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession()
  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-[280px] shrink-0 border-r border-line bg-card lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Link href="/" className="flex items-center gap-2 text-lg font-display font-semibold text-navy">
            <span aria-hidden="true" className="inline-block h-6 w-6 rounded bg-teal" />
            GSL HR
          </Link>
        </div>
        <SidebarNav role={session?.role ?? 'Admin'} />
        <div className="mt-auto border-t border-line px-5 py-4">
          <div className="mb-3 text-xs text-ink-3">
            Signed in as<br />
            <span className="text-ink font-medium">{session?.name ?? 'Unknown'}</span>
            <span className="ml-1 text-ink-2">({session?.role})</span>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-line bg-card px-5">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-display font-semibold text-navy lg:hidden"
          >
            <span aria-hidden="true" className="inline-block h-6 w-6 rounded bg-teal" />
            GSL HR
          </Link>
          <div className="hidden text-sm text-ink-3 lg:block">
            {session?.name && (
              <>
                <span className="text-ink">{session.name}</span>
                <span className="ml-1 text-ink-3">({session.role})</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <SyncNowButton />
            <span className="text-sm text-ink-2 lg:hidden">{session?.name ?? '-'}</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
