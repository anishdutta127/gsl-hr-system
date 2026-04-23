import Link from 'next/link'
import { loadEmployees, loadApplications, loadCandidates } from '@/lib/data'
import { formatDate, formatRs } from '@/lib/format'

export default function EmployeesPage() {
  const employees = loadEmployees()
  const applications = loadApplications()
  const candidates = loadCandidates()

  const candidateById = new Map(candidates.map((c) => [c.id, c] as const))

  // Pre-employee: applications in Joined stage without an employee record yet
  const pending = applications.filter((a) => {
    if (a.currentStage !== 'Joined') return false
    return !employees.some((e) => e.applicationId === a.id)
  })

  const active = employees.filter((e) => e.status === 'Active')
  const exited = employees.filter((e) => e.status === 'Exited')

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Employees</h1>
        <p className="mt-1 text-sm text-ink-2">
          Everyone who has joined GSL through this system.
        </p>
      </div>

      {pending.length > 0 && (
        <section aria-labelledby="pending-heading" className="mb-10">
          <h2 id="pending-heading" className="mb-3 font-display text-lg text-ink">
            Awaiting activation ({pending.length})
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {pending.map((a) => {
              const candidate = candidateById.get(a.candidateId)
              return (
                <li key={a.id}>
                  <Link
                    href={`/employees/new?applicationId=${a.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
                  >
                    <span>
                      <span className="block font-medium text-ink">
                        {candidate?.name ?? '(unknown)'}
                      </span>
                      <span className="block text-xs text-ink-2">
                        Marked Joined on {formatDate(a.stageEnteredAt)}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-navy">Create employee record →</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {active.length === 0 && exited.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center text-sm text-ink-2">
          No employee records yet. Candidates who reach the Joined stage can be activated here.
        </div>
      ) : (
        <>
          <EmployeeSection title="Active" employees={active} />
          {exited.length > 0 && <EmployeeSection title="Exited" employees={exited} />}
        </>
      )}
    </div>
  )
}

function EmployeeSection({
  title,
  employees,
}: {
  title: string
  employees: ReturnType<typeof loadEmployees>
}) {
  return (
    <section aria-labelledby={`section-${title}`} className="mb-10">
      <h2 id={`section-${title}`} className="mb-3 font-display text-lg text-ink">
        {title} ({employees.length})
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {employees.map((e) => (
          <li key={e.id}>
            <Link
              href={`/employees/${e.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
            >
              <span>
                <span className="block font-medium text-ink">{e.name}</span>
                <span className="block text-xs text-ink-2">
                  {e.designation} · {e.department} · Joined {formatDate(e.dateOfJoining)}
                </span>
              </span>
              <span className="text-xs text-ink-3 tabular">
                {e.ctcAnnual != null ? formatRs(e.ctcAnnual, { compact: true }) : '—'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
