import Link from 'next/link'
import { loadEmployees } from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function ExitsPage() {
  await requireRoles(['Admin', 'HR'])
  const employees = loadEmployees()
  const active = employees.filter((e) => e.status === 'Active')
  const exited = employees.filter((e) => e.status === 'Exited')

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Exits</h1>
        <p className="mt-1 text-sm text-ink-2">
          Track last working days, relieving letters, and experience letters.
        </p>
      </div>

      <section aria-labelledby="exited-heading" className="mb-10">
        <h2 id="exited-heading" className="mb-3 font-display text-lg text-ink">
          Exited ({exited.length})
        </h2>
        {exited.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No exits recorded yet.
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {exited.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/employees/${e.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
                >
                  <span>
                    <span className="block font-medium text-ink">{e.name}</span>
                    <span className="block text-xs text-ink-2">
                      {e.designation} · LWD {e.exit ? formatDate(e.exit.lastWorkingDay) : '—'} ·{' '}
                      {e.exit?.reason ?? '—'}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <LetterBadge label="Relieving" issued={Boolean(e.exit?.relievingLetterIssued)} />
                    <LetterBadge label="Experience" issued={Boolean(e.exit?.experienceLetterIssued)} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="active-heading">
        <h2 id="active-heading" className="mb-3 font-display text-lg text-ink">
          Active employees ({active.length})
        </h2>
        {active.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No active employees on record.
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {active.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/employees/${e.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
                >
                  <span>
                    <span className="block font-medium text-ink">{e.name}</span>
                    <span className="block text-xs text-ink-2">
                      {e.designation} · Joined {formatDate(e.dateOfJoining)}
                    </span>
                  </span>
                  <span className="text-xs font-medium text-navy">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function LetterBadge({ label, issued }: { label: string; issued: boolean }) {
  return (
    <span
      className={
        issued
          ? 'inline-flex items-center rounded bg-teal-light px-2 py-1 text-xs font-medium text-teal-dark'
          : 'inline-flex items-center rounded bg-surface px-2 py-1 text-xs text-ink-2'
      }
    >
      {label}: {issued ? 'Issued' : 'Pending'}
    </span>
  )
}
