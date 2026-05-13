import Link from 'next/link'
import { loadEmployees } from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate } from '@/lib/format'
import { InitiateExitPicker, type PickerEmployee } from './InitiateExitPicker'

export const dynamic = 'force-dynamic'

/**
 * Recruitment-side Exits surface. Dedicated view of employees who have
 * exited - last working days, relieving and experience letter status.
 *
 * The "initiate exit" flow lives on the employee detail page (see
 * ExitInitiator). This page surfaces a picker so HR can jump straight
 * into that flow without first having to navigate to /employees and
 * find the employee themselves.
 */
export default async function ExitsPage() {
  await requireRoles(['Admin', 'HR'])
  const employees = loadEmployees()
  const exited = employees.filter((e) => e.status === 'Exited')
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
            Track last working days, relieving letters, and experience letters
            for employees who have exited. For the active employee roster, use{' '}
            <Link href="/employees" className="font-medium text-navy hover:underline">
              Employees
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mb-8">
        <InitiateExitPicker employees={active} />
      </div>

      <section aria-labelledby="exited-heading">
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
                      {e.designation} · LWD {e.exit ? formatDate(e.exit.lastWorkingDay) : '-'} ·{' '}
                      {e.exit?.reason ?? '-'}
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
