import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById, loadUsers } from '@/lib/data'
import {
  loadOnboardingTasks,
  loadOnboardingTemplates,
  summariseOnboarding,
  canUserSeeTask,
} from '@/lib/onboardingTasks'
import { TaskChecklist } from './TaskChecklist'
import { TaskGenerator } from './TaskGenerator'

export const dynamic = 'force-dynamic'

export default async function EmployeeOnboardingPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const employee = await findEmployeeById(params.id)
  if (!employee) notFound()

  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isLeadership = session.role === 'Leadership'
  const isHod = session.role === 'HOD'
  const isOwnReport = isHod && employee.reportingManagerId === session.sub

  if (!isHrOrAdmin && !isLeadership && !isOwnReport) {
    redirect('/')
  }

  const templates = loadOnboardingTemplates()
  const allTasks = loadOnboardingTasks().filter((t) => t.employeeId === employee.id)
  // HOD sees only their assigned-to-them or their direct-reports tasks.
  const tasks = isHrOrAdmin || isLeadership
    ? allTasks
    : allTasks.filter((t) =>
        canUserSeeTask({
          task: t,
          user: { id: session.sub, role: session.role },
          employee,
        }),
      )

  const summary = summariseOnboarding({ templates, tasks: allTasks })
  const users = (await loadUsers()).map((u) => ({ id: u.id, name: u.name, role: u.role }))

  return (
    <div className="container-page py-8">
      <div className="mb-2">
        <Link href={`/employees/${employee.id}`} className="text-xs font-medium text-navy hover:underline">
          ← Back to employee
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">{employee.name} — Onboarding</h1>
        <p className="mt-1 text-sm text-ink-2">
          {employee.designation} · {employee.department} · {employee.employeeCode}
        </p>
      </div>

      {tasks.length === 0 ? (
        <EmptyState canEdit={isHrOrAdmin} employeeId={employee.id} employee={employee} />
      ) : (
        <>
          <ProgressBar summary={summary} />
          <TaskChecklist
            tasks={tasks.map((t) => ({
              id: t.id,
              templateId: t.templateId,
              status: t.status,
              assignedTo: t.assignedTo,
              dueDate: t.dueDate,
              notes: t.notes,
              blockers: t.blockers,
            }))}
            templates={templates}
            users={users}
            canEdit={isHrOrAdmin || isOwnReport}
            isHrOrAdmin={isHrOrAdmin}
          />
        </>
      )}
    </div>
  )
}

function ProgressBar({
  summary,
}: {
  summary: ReturnType<typeof summariseOnboarding>
}) {
  const denom = summary.total - summary.notApplicable
  const pct = denom === 0 ? 0 : Math.round((summary.completed / denom) * 100)
  return (
    <div className="mb-6 rounded-lg border border-line bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg text-ink">
          {summary.completed} / {denom} mandatory complete
        </h2>
        <span className="text-2xl font-display tabular text-ink">{pct}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded bg-line">
        <div
          className={summary.isOnboarded ? 'h-full bg-success' : 'h-full bg-orange'}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-3">
        <Stat label="In progress" value={summary.inProgress} />
        <Stat label="Blocked" value={summary.blocked} tone={summary.blocked > 0 ? 'warn' : 'normal'} />
        <Stat label="N/A" value={summary.notApplicable} />
        {summary.isOnboarded && (
          <span className="ml-auto rounded-sm bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
            Onboarding complete
          </span>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'normal',
}: {
  label: string
  value: number
  tone?: 'normal' | 'warn'
}) {
  return (
    <span>
      {label}:{' '}
      <span className={`tabular ${tone === 'warn' && value > 0 ? 'text-warning font-medium' : 'text-ink'}`}>
        {value}
      </span>
    </span>
  )
}

function EmptyState({
  canEdit,
  employeeId,
  employee,
}: {
  canEdit: boolean
  employeeId: string
  employee: { dateOfJoining: string | null; status: string }
}) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
      <p className="text-sm text-ink-2">
        {employee.status === 'Exited'
          ? 'This employee has exited; no onboarding tasks generated.'
          : !employee.dateOfJoining
            ? 'No joining date on this employee yet — onboarding starts once a date is set.'
            : 'No onboarding tasks yet for this employee.'}
      </p>
      {canEdit && employee.status !== 'Exited' && employee.dateOfJoining && (
        <div className="mt-4 inline-block">
          <TaskGenerator employeeId={employeeId} />
        </div>
      )}
    </div>
  )
}
