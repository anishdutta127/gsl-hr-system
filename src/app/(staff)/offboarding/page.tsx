import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees } from '@/lib/data'
import {
  loadOffboardingTasks,
  loadOffboardingTemplates,
  summariseOffboarding,
} from '@/lib/offboardingTasks'

export const dynamic = 'force-dynamic'

export default async function OffboardingOverviewPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isLeadership = session.role === 'Leadership'
  const isHod = session.role === 'HOD'
  if (!isHrOrAdmin && !isLeadership && !isHod) redirect('/')

  const employees = loadEmployees()
  const templates = loadOffboardingTemplates()
  const allTasks = loadOffboardingTasks()
  const tasksByEmp = new Map<string, typeof allTasks>()
  for (const t of allTasks) {
    const list = tasksByEmp.get(t.employeeId) ?? []
    list.push(t)
    tasksByEmp.set(t.employeeId, list)
  }

  let rows = employees
    .map((e) => {
      const tasks = tasksByEmp.get(e.id) ?? []
      if (tasks.length === 0) return null
      const summary = summariseOffboarding({ templates, tasks })
      return { e, summary, tasks }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (isHod) {
    // Reporting Manager scope: only tasks for direct reports.
    rows = rows.filter((r) => r.e.reportingManagerId === session.sub)
  }

  // Sort: incomplete first, then alphabetical.
  rows.sort((a, b) => {
    if (a.summary.isOffboarded !== b.summary.isOffboarded) {
      return a.summary.isOffboarded ? 1 : -1
    }
    return a.e.name.localeCompare(b.e.name)
  })

  const inProgress = rows.filter((r) => !r.summary.isOffboarded).length
  const completed = rows.filter((r) => r.summary.isOffboarded).length
  const blocked = rows.reduce((acc, r) => acc + r.summary.blocked, 0)

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Offboarding</h1>
        <p className="mt-1 text-sm text-ink-2">
          {rows.length} employee{rows.length === 1 ? '' : 's'} with offboarding records.
          {isHod && ' Showing your direct reports only.'}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="In progress" value={inProgress} tone={inProgress > 0 ? 'warning' : 'ok'} />
        <Stat label="Completed" value={completed} tone="ok" />
        <Stat label="Blocked tasks" value={blocked} tone={blocked > 0 ? 'warning' : 'ok'} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center text-sm text-ink-2">
          No offboarding records.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
                <th className="px-5 py-2">Employee</th>
                <th className="px-3 py-2 w-[140px]">Status</th>
                <th className="px-3 py-2 text-right w-[140px]">Mandatory left</th>
                <th className="px-3 py-2 text-right w-[120px]">Blocked</th>
                <th className="px-5 py-2 text-right w-[100px]">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, summary }) => (
                <tr key={e.id} className="border-b border-line/50 hover:bg-surface">
                  <td className="px-5 py-2">
                    <div className="font-medium text-ink">{e.name}</div>
                    <div className="text-xs text-ink-3 tabular">
                      {e.employeeCode} · {e.department}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {summary.isOffboarded ? (
                      <span className="rounded-sm bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
                        Complete
                      </span>
                    ) : (
                      <span className="rounded-sm bg-orange-light px-2 py-0.5 text-xs font-medium text-orange-dark">
                        In progress
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    <span className={summary.mandatoryRemaining > 0 ? 'text-orange-dark font-medium' : 'text-ink-3'}>
                      {summary.mandatoryRemaining}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    <span className={summary.blocked > 0 ? 'text-warning font-medium' : 'text-ink-3'}>
                      {summary.blocked}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-right">
                    <Link
                      href={`/employees/${e.id}/offboarding`}
                      className="text-xs font-medium text-navy hover:text-navy-dark"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warning' | 'danger' }) {
  const colors = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-success'
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className={`font-display text-3xl tabular ${colors}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  )
}
