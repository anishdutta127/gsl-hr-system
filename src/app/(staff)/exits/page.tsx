import Link from 'next/link'
import { loadEmployees } from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate } from '@/lib/format'
import { handoverStatus, loadExitHandovers } from '@/lib/exitHandover'
import type { HandoverStatus } from '@/lib/types'
import { InitiateExitPicker, type PickerEmployee } from './InitiateExitPicker'

export const dynamic = 'force-dynamic'

/**
 * Recruitment-side Exits surface. Tracks exited employees: LWD,
 * relieving and experience letters, and the handover document.
 *
 * Handover statuses are derived from `exit_handovers.json` keyed by
 * employee id. HR-Admin can spot the "Submitted" queue to know which
 * handovers need review.
 */
export default async function ExitsPage({
  searchParams,
}: {
  searchParams: { handover?: string }
}) {
  await requireRoles(['Admin', 'HR'])
  const employees = loadEmployees()
  const exited = employees.filter((e) => e.status === 'Exited')
  const handovers = loadExitHandovers()
  const handoverByEmp = new Map(handovers.map((h) => [h.employeeId, h]))
  const filterStatus = searchParams.handover as HandoverStatus | undefined

  const exitedWithHandover = exited.map((e) => ({
    employee: e,
    handover: handoverByEmp.get(e.id),
    status: handoverStatus(handoverByEmp.get(e.id)),
  }))

  const filtered = filterStatus
    ? exitedWithHandover.filter((row) => row.status === filterStatus)
    : exitedWithHandover

  const statusCounts: Record<HandoverStatus, number> = {
    'Not started': 0,
    'In progress': 0,
    Submitted: 0,
    Reviewed: 0,
  }
  for (const row of exitedWithHandover) statusCounts[row.status]++

  const active: PickerEmployee[] = employees
    .filter((e) => e.status === 'Active')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      id: e.id,
      name: e.name,
      designation: e.designation ?? null,
      department: e.department ?? null,
      employeeCode: e.employeeCode ?? null,
    }))

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Exits</h1>
          <p className="mt-1 text-sm text-ink-2">
            Track last working days, relieving letters, experience letters, and
            handover documents for employees who have exited. For the active employee
            roster, use{' '}
            <Link href="/employees" className="font-medium text-navy hover:underline">
              Employees
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FilterStat
          label="Not started"
          value={statusCounts['Not started']}
          href="/exits?handover=Not%20started"
          active={filterStatus === 'Not started'}
          tone="muted"
        />
        <FilterStat
          label="In progress"
          value={statusCounts['In progress']}
          href="/exits?handover=In%20progress"
          active={filterStatus === 'In progress'}
          tone="warning"
        />
        <FilterStat
          label="Submitted"
          value={statusCounts.Submitted}
          href="/exits?handover=Submitted"
          active={filterStatus === 'Submitted'}
          tone="navy"
        />
        <FilterStat
          label="Reviewed"
          value={statusCounts.Reviewed}
          href="/exits?handover=Reviewed"
          active={filterStatus === 'Reviewed'}
          tone="success"
        />
      </div>

      <div className="mb-8">
        <InitiateExitPicker employees={active} />
      </div>

      <section aria-labelledby="exited-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="exited-heading" className="font-display text-lg text-ink">
            Exited ({filtered.length}
            {filterStatus ? ` of ${exited.length}` : ''})
          </h2>
          {filterStatus && (
            <Link href="/exits" className="text-xs font-medium text-navy hover:underline">
              Clear filter
            </Link>
          )}
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            {filterStatus ? `No exits with handover status ${filterStatus}.` : 'No exits recorded yet.'}
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {filtered.map(({ employee: e, status }) => (
              <li key={e.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
                  <Link
                    href={`/employees/${e.id}`}
                    className="min-w-0 flex-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  >
                    <span className="block font-medium text-ink">{e.name}</span>
                    <span className="block text-xs text-ink-2">
                      {e.designation} · LWD {e.exit ? formatDate(e.exit.lastWorkingDay) : '-'} ·{' '}
                      {e.exit?.reason ?? '-'}
                    </span>
                  </Link>
                  <span className="flex flex-wrap gap-2">
                    <HandoverBadge status={status} />
                    <Link
                      href={`/exits/${e.id}/handover`}
                      className="inline-flex min-h-[36px] items-center rounded border border-line-strong px-2 py-1 text-xs font-medium text-ink hover:bg-surface"
                    >
                      Handover
                    </Link>
                    <LetterBadge label="Relieving" issued={Boolean(e.exit?.relievingLetterIssued)} />
                    <LetterBadge label="Experience" issued={Boolean(e.exit?.experienceLetterIssued)} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function HandoverBadge({ status }: { status: HandoverStatus }) {
  const tone =
    status === 'Reviewed'
      ? 'bg-success-bg text-success'
      : status === 'Submitted'
        ? 'bg-navy-light text-navy'
        : status === 'In progress'
          ? 'bg-warning-bg text-warning'
          : 'bg-surface text-ink-3'
  return (
    <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${tone}`}>
      Handover: {status}
    </span>
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

function FilterStat({
  label,
  value,
  href,
  active,
  tone,
}: {
  label: string
  value: number
  href: string
  active: boolean
  tone: 'muted' | 'warning' | 'navy' | 'success'
}) {
  const toneClass =
    tone === 'success'
      ? 'border-success'
      : tone === 'navy'
        ? 'border-navy'
        : tone === 'warning'
          ? 'border-warning'
          : 'border-line'
  return (
    <Link
      href={href}
      className={`block rounded-lg border ${toneClass} ${active ? 'bg-surface ring-2 ring-teal' : 'bg-card'} p-4 transition hover:bg-surface`}
    >
      <div className="font-display text-3xl tabular text-ink">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-ink-3">{label}</div>
    </Link>
  )
}
