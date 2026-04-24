import Link from 'next/link'
import { loadEmployees, loadApplications, loadCandidates } from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate, formatRs } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: { department?: string; q?: string }
}) {
  await requireRoles(['Admin', 'HR', 'Leadership'])
  const employees = loadEmployees()
  const applications = loadApplications()
  const candidates = loadCandidates()

  const candidateById = new Map(candidates.map((c) => [c.id, c] as const))

  // Pre-employee: applications in Joined stage without an employee record yet
  const pending = applications.filter((a) => {
    if (a.currentStage !== 'Joined') return false
    return !employees.some((e) => e.applicationId === a.id)
  })

  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean))).sort()

  const filterDept = searchParams.department?.trim() ?? ''
  const q = searchParams.q?.trim().toLowerCase() ?? ''
  const filtered = employees.filter((e) => {
    if (filterDept && e.department !== filterDept) return false
    if (q) {
      const hay = `${e.name} ${e.designation} ${e.employeeCode} ${e.email}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const active = filtered.filter((e) => e.status === 'Active')
  const exited = filtered.filter((e) => e.status === 'Exited')

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Employees</h1>
        <p className="mt-1 text-sm text-ink-2">
          {employees.length.toLocaleString('en-IN')} on the master roster. Filter by department or
          search by name, code, or designation.
        </p>
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3" role="search" aria-label="Filter employees">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="q" className="block text-xs font-medium text-ink-2">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="name, code, designation"
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>
        <div>
          <label htmlFor="department" className="block text-xs font-medium text-ink-2">
            Department
          </label>
          <select
            id="department"
            name="department"
            defaultValue={filterDept}
            className="mt-1 block rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
        >
          Apply
        </button>
        {(filterDept || q) && (
          <Link
            href="/employees"
            className="text-xs font-medium text-ink-2 hover:text-ink"
          >
            Clear
          </Link>
        )}
      </form>

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
          {employees.length === 0
            ? 'No employee records yet. Candidates who reach the Joined stage can be activated here.'
            : 'No matches for the current filter.'}
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
                <span className="block font-medium text-ink">
                  {e.title ? `${e.title} ` : ''}
                  {e.name}
                  <span className="ml-2 text-xs font-normal text-ink-3 tabular">
                    {e.employeeCode}
                  </span>
                </span>
                <span className="block text-xs text-ink-2">
                  {e.designation} · {e.department} · Joined {formatDate(e.dateOfJoining)}
                </span>
              </span>
              <span className="text-xs text-ink-3 tabular">
                {e.ctcAnnual != null ? formatRs(e.ctcAnnual, { compact: true }) : '-'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
