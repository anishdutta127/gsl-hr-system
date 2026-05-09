import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById, loadEmployees } from '@/lib/data'
import { loadLeaveApplications } from '@/lib/leave'
import { LeaveOverviewTable } from './LeaveOverviewTable'

export const dynamic = 'force-dynamic'

export default async function LeaveOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string
    type?: string
    department?: string
    q?: string
  }>
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isLeadership = session.role === 'Leadership'
  const isHod = session.role === 'HOD'
  if (!isHrOrAdmin && !isLeadership && !isHod) redirect('/')

  const params = (await searchParams) ?? {}
  const employees = loadEmployees()
  const empById = new Map(employees.map((e) => [e.id, e]))
  let apps = loadLeaveApplications()

  if (isHod) {
    // Reporting Manager scope: only direct reports' applications.
    const myReports = new Set(
      employees.filter((e) => e.reportingManagerId === session.sub).map((e) => e.id),
    )
    apps = apps.filter((a) => myReports.has(a.employeeId))
  }

  // Filters
  if (params.status) apps = apps.filter((a) => a.status === params.status)
  if (params.type) apps = apps.filter((a) => a.leaveType === params.type)
  if (params.department) {
    apps = apps.filter((a) => empById.get(a.employeeId)?.department === params.department)
  }
  if (params.q) {
    const q = params.q.toLowerCase()
    apps = apps.filter((a) => {
      const e = empById.get(a.employeeId)
      const hay = `${e?.name ?? ''} ${e?.employeeCode ?? ''} ${a.reason}`.toLowerCase()
      return hay.includes(q)
    })
  }

  // Sort: Submitted first (action needed), then by start date desc
  apps.sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === 'Submitted') return -1
      if (b.status === 'Submitted') return 1
    }
    return b.startDate.localeCompare(a.startDate)
  })

  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean))).sort()

  const totals = apps.reduce(
    (acc, a) => {
      acc.total++
      if (a.status === 'Submitted') acc.pending++
      if (a.status === 'Approved') acc.approved++
      if (a.status === 'Rejected') acc.rejected++
      return acc
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 },
  )

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Leave</h1>
        <p className="mt-1 text-sm text-ink-2">
          {totals.total} application{totals.total === 1 ? '' : 's'} matching your filter.
          {isHod && ' Showing your direct reports only.'}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pending approval" value={totals.pending} tone={totals.pending > 0 ? 'warning' : 'ok'} />
        <Stat label="Approved" value={totals.approved} tone="ok" />
        <Stat label="Rejected" value={totals.rejected} tone="ok" />
        <Stat label="Total" value={totals.total} tone="ok" />
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3" role="search" aria-label="Filter leaves">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Search</label>
          <input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="name / code / reason"
            className="mt-1 w-full rounded border border-line-strong bg-card px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Status</label>
          <select
            name="status"
            defaultValue={params.status ?? ''}
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="Submitted">Submitted</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Recalled">Recalled</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Type</label>
          <select
            name="type"
            defaultValue={params.type ?? ''}
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="casual">Casual</option>
            <option value="sick">Sick</option>
            <option value="unpaid">Unpaid</option>
            <option value="maternity">Maternity</option>
            <option value="paternity">Paternity</option>
            <option value="bereavement">Bereavement</option>
            <option value="compensatory">Compensatory</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Department</label>
          <select
            name="department"
            defaultValue={params.department ?? ''}
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark"
        >
          Apply
        </button>
        {(params.q || params.status || params.type || params.department) && (
          <Link href="/leave" className="text-xs font-medium text-ink-2 hover:text-ink">
            Clear
          </Link>
        )}
      </form>

      <LeaveOverviewTable
        rows={apps.map((a) => {
          const emp = empById.get(a.employeeId)
          return {
            id: a.id,
            employeeId: a.employeeId,
            employeeName: emp?.name ?? '(deleted)',
            employeeCode: emp?.employeeCode ?? '—',
            department: emp?.department ?? '—',
            leaveType: a.leaveType,
            startDate: a.startDate,
            endDate: a.endDate,
            totalDays: a.totalDays,
            lossOfPayDays: a.lossOfPayDays,
            status: a.status,
            reason: a.reason,
            isEmergency: a.isEmergency,
          }
        })}
      />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warning' | 'danger' }) {
  const colors = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-ink'
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className={`font-display text-3xl tabular ${colors}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  )
}
