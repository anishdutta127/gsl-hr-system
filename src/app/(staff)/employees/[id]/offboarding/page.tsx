import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById, loadUsers } from '@/lib/data'
import {
  canUserSeeOffboardingTask,
  canViewExitInterview,
  loadExitInterviews,
  loadFFSettlements,
  loadOffboardingTasks,
  loadOffboardingTemplates,
  summariseOffboarding,
} from '@/lib/offboardingTasks'
import { OffboardingTaskChecklist } from './OffboardingTaskChecklist'
import { OffboardingGenerator } from './OffboardingGenerator'
import { ExitInterviewForm } from './ExitInterviewForm'
import { FFSettlementForm } from './FFSettlementForm'

export const dynamic = 'force-dynamic'

export default async function EmployeeOffboardingPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const employee = findEmployeeById(params.id)
  if (!employee) notFound()

  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isLeadership = session.role === 'Leadership'
  const isHod = session.role === 'HOD'
  const isOwnReport = isHod && employee.reportingManagerId === session.sub

  if (!isHrOrAdmin && !isLeadership && !isOwnReport) {
    redirect('/')
  }

  const templates = loadOffboardingTemplates()
  const allTasks = loadOffboardingTasks().filter((t) => t.employeeId === employee.id)

  const tplById = new Map(templates.map((t) => [t.id, t]))
  const visibleTasks = isHrOrAdmin || isLeadership
    ? allTasks
    : allTasks.filter((t) =>
        canUserSeeOffboardingTask({
          task: t,
          template: tplById.get(t.templateId),
          user: { id: session.sub, role: session.role },
          employee,
        }),
      )

  const summary = summariseOffboarding({ templates, tasks: allTasks })
  const users = loadUsers().map((u) => ({ id: u.id, name: u.name, role: u.role }))

  const showInterview = canViewExitInterview(session)
  const interview = showInterview
    ? loadExitInterviews().find((i) => i.employeeId === employee.id)
    : undefined
  const showFF = isHrOrAdmin
  const ff = showFF ? loadFFSettlements().find((f) => f.employeeId === employee.id) : undefined

  return (
    <div className="container-page py-8">
      <div className="mb-2">
        <Link
          href={`/employees/${employee.id}`}
          className="text-xs font-medium text-navy hover:underline"
        >
          ← Back to employee
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">{employee.name} — Offboarding</h1>
        <p className="mt-1 text-sm text-ink-2">
          {employee.designation} · {employee.department} · {employee.employeeCode}
        </p>
      </div>

      {allTasks.length === 0 ? (
        <EmptyState canEdit={isHrOrAdmin} employeeId={employee.id} />
      ) : (
        <>
          <div className="mb-6 rounded-lg border border-line bg-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg text-ink">
                {summary.completed} / {summary.total - summary.notApplicable} mandatory complete
              </h2>
              {summary.isOffboarded && (
                <span className="rounded-sm bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
                  Offboarding complete
                </span>
              )}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-line">
              <div
                className={summary.isOffboarded ? 'h-full bg-success' : 'h-full bg-orange'}
                style={{
                  width: `${
                    summary.total === 0
                      ? 0
                      : Math.round(
                          (summary.completed / Math.max(1, summary.total - summary.notApplicable)) * 100,
                        )
                  }%`,
                }}
              />
            </div>
          </div>

          <OffboardingTaskChecklist
            tasks={visibleTasks.map((t) => ({
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

          {showInterview && (
            <section className="mt-6">
              <h2 className="mb-3 font-display text-lg text-ink">Exit interview</h2>
              <ExitInterviewForm
                employeeId={employee.id}
                initial={
                  interview ?? {
                    reasonForLeaving: '',
                    wouldRecommend: null,
                    satisfactionWithManager: null,
                    satisfactionWithRole: null,
                    topThingsToChange: '',
                    freeText: '',
                  }
                }
                canEdit={isHrOrAdmin}
              />
            </section>
          )}

          {showFF && (
            <section className="mt-6">
              <h2 className="mb-3 font-display text-lg text-ink">Full and final settlement</h2>
              <FFSettlementForm
                employeeId={employee.id}
                initial={
                  ff ?? {
                    finalSalaryDays: 0,
                    leaveEncashment: 0,
                    recoveryItems: [],
                    noticePeriodAdjustment: 0,
                    totalNet: 0,
                    notes: '',
                    paidAt: null,
                  }
                }
              />
            </section>
          )}
        </>
      )}
    </div>
  )
}

function EmptyState({
  canEdit,
  employeeId,
}: {
  canEdit: boolean
  employeeId: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
      <p className="text-sm text-ink-2">No offboarding tasks for this employee yet.</p>
      {canEdit && (
        <div className="mt-4 inline-block">
          <OffboardingGenerator employeeId={employeeId} />
        </div>
      )}
    </div>
  )
}
