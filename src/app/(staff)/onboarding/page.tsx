import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees } from '@/lib/data'
import {
  loadOnboardingTasks,
  loadOnboardingTemplates,
  summariseOnboarding,
} from '@/lib/onboardingTasks'

export const dynamic = 'force-dynamic'

export default async function OnboardingOverviewPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isLeadership = session.role === 'Leadership'
  const isHod = session.role === 'HOD'
  if (!isHrOrAdmin && !isLeadership && !isHod) redirect('/')

  const employees = (await loadEmployees()).filter((e) => e.status !== 'Exited')
  const templates = loadOnboardingTemplates()
  const allTasks = loadOnboardingTasks()
  const tasksByEmp = new Map<string, typeof allTasks>()
  for (const t of allTasks) {
    const list = tasksByEmp.get(t.employeeId) ?? []
    list.push(t)
    tasksByEmp.set(t.employeeId, list)
  }

  // Filter to onboarding-active employees: have tasks AND not yet "isOnboarded".
  let rows = employees
    .map((e) => {
      const tasks = tasksByEmp.get(e.id) ?? []
      if (tasks.length === 0) return null
      const summary = summariseOnboarding({ templates, tasks })
      return { e, summary, tasks }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && !r.summary.isOnboarded)

  // Reporting-Manager scoping: HOD sees only their direct reports.
  if (isHod) {
    rows = rows.filter((r) => r.e.reportingManagerId === session.sub)
  }

  // Sort: most overdue first, then most-recent join date.
  const now = new Date()
  rows.sort((a, b) => {
    const aOverdue = oldestOverdue(a.tasks, now)
    const bOverdue = oldestOverdue(b.tasks, now)
    if (aOverdue !== bOverdue) return aOverdue - bOverdue
    return (a.e.dateOfJoining ?? '').localeCompare(b.e.dateOfJoining ?? '')
  })

  const totals = rows.reduce(
    (acc, r) => {
      acc.dueToday += countDueToday(r.tasks, now)
      acc.overdue += countOverdue(r.tasks, now)
      acc.blocked += r.summary.blocked
      return acc
    },
    { dueToday: 0, overdue: 0, blocked: 0 },
  )

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Onboarding</h1>
        <p className="mt-1 text-sm text-ink-2">
          {rows.length} employee{rows.length === 1 ? '' : 's'} currently onboarding.
          {isHod && ' Showing your direct reports only.'}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active" value={rows.length} tone="ok" />
        <Stat label="Tasks due today" value={totals.dueToday} tone={totals.dueToday > 0 ? 'warning' : 'ok'} />
        <Stat label="Tasks overdue" value={totals.overdue} tone={totals.overdue > 0 ? 'danger' : 'ok'} />
        <Stat label="Blocked tasks" value={totals.blocked} tone={totals.blocked > 0 ? 'warning' : 'ok'} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center text-sm text-ink-2">
          No onboardings in progress.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
                <th className="px-5 py-2">Employee</th>
                <th className="px-3 py-2 w-[120px]">Joined</th>
                <th className="px-3 py-2 text-right w-[120px]">Mandatory left</th>
                <th className="px-3 py-2 text-right w-[120px]">Overdue</th>
                <th className="px-3 py-2 text-right w-[120px]">Blocked</th>
                <th className="px-5 py-2 text-right w-[100px]">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, summary, tasks }) => {
                const overdue = countOverdue(tasks, now)
                return (
                  <tr key={e.id} className="border-b border-line/50 hover:bg-surface">
                    <td className="px-5 py-2">
                      <div className="font-medium text-ink">{e.name}</div>
                      <div className="text-xs text-ink-3 tabular">
                        {e.employeeCode} · {e.department}
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular text-ink-2">{e.dateOfJoining ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular">
                      <span className={summary.mandatoryRemaining > 0 ? 'text-orange-dark font-medium' : 'text-ink-3'}>
                        {summary.mandatoryRemaining}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      <span className={overdue > 0 ? 'text-danger font-medium' : 'text-ink-3'}>
                        {overdue}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      <span className={summary.blocked > 0 ? 'text-warning font-medium' : 'text-ink-3'}>
                        {summary.blocked}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-right">
                      <Link
                        href={`/employees/${e.id}/onboarding`}
                        className="text-xs font-medium text-navy hover:text-navy-dark"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                )
              })}
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

function countOverdue(tasks: Awaited<ReturnType<typeof loadOnboardingTasks>>, now: Date): number {
  return tasks.filter((t) => {
    if (t.status === 'Completed' || t.status === 'N/A') return false
    return new Date(`${t.dueDate}T00:00:00Z`).getTime() < now.getTime() - 24 * 60 * 60 * 1000
  }).length
}

function countDueToday(tasks: Awaited<ReturnType<typeof loadOnboardingTasks>>, now: Date): number {
  const today = now.toISOString().slice(0, 10)
  return tasks.filter(
    (t) => t.status !== 'Completed' && t.status !== 'N/A' && t.dueDate === today,
  ).length
}

function oldestOverdue(tasks: Awaited<ReturnType<typeof loadOnboardingTasks>>, now: Date): number {
  let oldest = 0
  for (const t of tasks) {
    if (t.status === 'Completed' || t.status === 'N/A') continue
    const d = new Date(`${t.dueDate}T00:00:00Z`).getTime() - now.getTime()
    if (d < oldest) oldest = d
  }
  return oldest
}
