import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees } from '@/lib/data'
import { formatDate } from '@/lib/format'
import { loadExitProcesses, summariseExit } from '@/lib/exitProcess'
import type { Employee, ExitProcess } from '@/lib/types'
import { InitiateExitPicker, type PickerEmployee } from './InitiateExitPicker'

export const dynamic = 'force-dynamic'

/**
 * Exits board - the single home for the exit lifecycle. In-progress exits
 * carry their live six-step checklist status; completed exits drop into the
 * Alumni group, out of the active /employees roster. Open to all staff;
 * HOD sees only their direct reports, Leadership is read-only.
 */
export default async function ExitsPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isLeadership = session.role === 'Leadership'
  const isHod = session.role === 'HOD'
  if (!isHrOrAdmin && !isLeadership && !isHod) redirect('/')

  const employees = loadEmployees()
  const employeeById = new Map(employees.map((e) => [e.id, e] as const))
  const processes = loadExitProcesses()

  function inScope(employeeId: string): boolean {
    if (isHrOrAdmin || isLeadership) return true
    const emp = employeeById.get(employeeId)
    return Boolean(emp && emp.reportingManagerId === session!.sub)
  }

  const rows = processes
    .filter((p) => inScope(p.employeeId))
    .map((p) => ({ process: p, employee: employeeById.get(p.employeeId) }))
    .filter((r): r is { process: ExitProcess; employee: Employee } => Boolean(r.employee))

  const inProgress = rows
    .filter((r) => !r.process.completedAt)
    .sort((a, b) => a.employee.name.localeCompare(b.employee.name))
  const alumni = rows
    .filter((r) => r.process.completedAt)
    .sort((a, b) => (b.process.completedAt ?? '').localeCompare(a.process.completedAt ?? ''))

  // Exited employees with no checklist yet (legacy exits before this reshape).
  const trackedIds = new Set(processes.map((p) => p.employeeId))
  const legacyExited = employees
    .filter((e) => e.status === 'Exited' && !trackedIds.has(e.id) && inScope(e.id))
    .sort((a, b) => a.name.localeCompare(b.name))

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
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Exits</h1>
        <p className="mt-1 text-sm text-ink-2">
          Drive each exit end-to-end from one page: handover, no dues, settlement, relieving and
          experience letters. For the active roster use{' '}
          <Link href="/employees" className="font-medium text-navy hover:underline">
            Employees
          </Link>
          .{isHod && ' Showing your direct reports only.'}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="In progress" value={inProgress.length} tone={inProgress.length > 0 ? 'warning' : 'ok'} />
        <Stat label="Alumni" value={alumni.length} tone="ok" />
        <Stat label="No checklist" value={legacyExited.length} tone={legacyExited.length > 0 ? 'muted' : 'ok'} />
      </div>

      {isHrOrAdmin && (
        <div className="mb-8">
          <InitiateExitPicker employees={active} />
        </div>
      )}

      <Section title={`In progress (${inProgress.length})`}>
        {inProgress.length === 0 ? (
          <Empty>No exits in progress.</Empty>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {inProgress.map(({ process, employee }) => (
              <ExitRow key={employee.id} employee={employee} process={process} />
            ))}
          </ul>
        )}
      </Section>

      {legacyExited.length > 0 && (
        <Section title={`Exited, no checklist (${legacyExited.length})`}>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {legacyExited.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/exits/${e.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
                >
                  <span>
                    <span className="block font-medium text-ink">{e.name}</span>
                    <span className="block text-xs text-ink-2">
                      {e.designation} · LWD {e.exit ? formatDate(e.exit.lastWorkingDay) : '-'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-orange-dark">
                    {isHrOrAdmin ? 'Start checklist →' : 'View →'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {alumni.length > 0 && (
        <Section title={`Alumni (${alumni.length})`}>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {alumni.map(({ process, employee }) => (
              <ExitRow key={employee.id} employee={employee} process={process} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function ExitRow({ employee, process }: { employee: Employee; process: ExitProcess }) {
  const summary = summariseExit(process)
  return (
    <li>
      <Link
        href={`/exits/${employee.id}`}
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{employee.name}</span>
          <span className="block text-xs text-ink-2">
            {employee.designation} · {employee.department} · LWD {formatDate(process.lastWorkingDay)}
          </span>
        </span>
        <span className="flex w-40 items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded bg-line" aria-hidden="true">
            <span
              className={summary.isComplete ? 'block h-full bg-success' : 'block h-full bg-orange'}
              style={{ width: `${summary.percent}%` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right text-xs tabular text-ink-2">{summary.percent}%</span>
        </span>
      </Link>
    </li>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8" aria-label={title}>
      <h2 className="mb-3 font-display text-lg text-ink">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
      {children}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warning' | 'muted' }) {
  const color = tone === 'warning' ? 'text-orange-dark' : tone === 'muted' ? 'text-ink-3' : 'text-success'
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className={`font-display text-3xl tabular ${color}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  )
}
