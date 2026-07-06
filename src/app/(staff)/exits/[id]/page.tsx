import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById, loadUsers } from '@/lib/data'
import { loadCompany } from '@/lib/company'
import { formatLongDate } from '@/lib/format'
import { todayLongEnGB } from '@/lib/letterTemplates'
import {
  buildHandoverEmail,
  canEditExitProcess,
  canReopenExitProcess,
  canViewExitProcess,
  canViewStepDetail,
  findExitProcess,
  loadExitStepTemplates,
  summariseExit,
} from '@/lib/exitProcess'
import { canViewExitInterview, loadExitInterviews } from '@/lib/offboardingTasks'
import { ExitInterviewForm } from '../../employees/[id]/offboarding/ExitInterviewForm'
import { StartExitForm } from './StartExitForm'
import { ExitCockpit, type CockpitStep } from './ExitCockpit'

export const dynamic = 'force-dynamic'

export default async function ExitCockpitPage({ params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const employee = findEmployeeById(params.id)
  if (!employee) notFound()

  if (!canViewExitProcess(session, employee)) redirect('/')

  const canEdit = canEditExitProcess(session)
  const templates = loadExitStepTemplates()
  const process = findExitProcess(employee.id)
  const company = loadCompany()

  // Resolve the reporting manager for the handover email.
  const users = loadUsers()
  const rmUser = employee.reportingManagerId
    ? users.find((u) => u.id === employee.reportingManagerId)
    : undefined
  const rmName = rmUser?.name ?? employee.reportingTo ?? null
  const rmEmail = rmUser?.email ?? null

  return (
    <div className="container-page py-8">
      <div className="mb-2">
        <Link href="/exits" className="text-xs font-medium text-orange-dark hover:underline">
          &larr; Back to exits
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">{employee.name} &mdash; Exit</h1>
        <p className="mt-1 text-sm text-ink-2">
          {[employee.designation, employee.department, employee.employeeCode]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {!process ? (
        canEdit ? (
          <StartExitForm employeeId={employee.id} employeeName={employee.name} />
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center text-sm text-ink-2">
            No exit has been started for this employee.
          </div>
        )
      ) : (
        (() => {
          const summary = summariseExit(process)
          const handover = buildHandoverEmail({
            employee,
            reportingManagerName: rmName,
            reportingManagerEmail: rmEmail,
            company,
          })
          const todayLong = todayLongEnGB()
          const dojLong = formatLongDate(employee.dateOfJoining)
          const lwdLong = formatLongDate(process.lastWorkingDay)
          const firstName = (employee.name || '').trim().split(/\s+/)[0] || employee.name

          const letterBaseValues: Record<string, Record<string, string>> = {
            'RELIEVING-v1': { issueDate: todayLong, dateOfJoining: dojLong, lastWorkingDay: lwdLong },
            'EXPERIENCE-v1': {
              issueDate: todayLong,
              salutationName: firstName,
              dateOfJoining: dojLong,
              lastWorkingDay: lwdLong,
            },
            'NO-DUES-v1': { date: todayLong },
          }

          const steps: CockpitStep[] = process.steps.map((s) => ({
            templateId: s.templateId,
            name: s.name,
            kind: s.kind,
            isMandatory: s.isMandatory,
            status: s.status,
            data: s.data,
            notes: s.notes,
            canSeeDetail: canViewStepDetail(session, s.kind),
          }))

          const showInterview = canViewExitInterview(session)
          const interview = showInterview
            ? loadExitInterviews().find((i) => i.employeeId === employee.id)
            : undefined

          return (
            <>
              <ExitCockpit
                employeeId={employee.id}
                employeeName={employee.name}
                exitMeta={{
                  exitType: process.exitType,
                  reasonForLeaving: process.reasonForLeaving,
                  resignationDate: process.resignationDate,
                  terminationDate: process.terminationDate,
                  lastWorkingDay: process.lastWorkingDay,
                  completedAt: process.completedAt,
                }}
                steps={steps}
                summary={summary}
                canEdit={canEdit}
                viewerEmail={session.email}
                handover={handover}
                letterBaseValues={letterBaseValues}
                closedState={{
                  closedAt: process.closedAt ?? null,
                  closedBy: process.closedBy ?? null,
                  closeReason: process.closeReason ?? null,
                }}
                canReopen={canReopenExitProcess(session, process, new Date().toISOString())}
              />

              {showInterview && (
                <section className="mt-8" aria-labelledby="exit-interview-heading">
                  <h2 id="exit-interview-heading" className="mb-3 font-display text-lg text-ink">
                    Exit interview
                  </h2>
                  <p className="mb-3 text-xs text-ink-3">
                    Confidential. Reporting managers never see this.
                  </p>
                  <ExitInterviewForm
                    employeeId={employee.id}
                    canonicalReason={process.reasonForLeaving || employee.exit?.reason || ''}
                    initialDocument={interview?.interviewDocument ?? null}
                    initial={
                      interview ?? {
                        reasonForLeaving: process.reasonForLeaving,
                        wouldRecommend: null,
                        satisfactionWithManager: null,
                        satisfactionWithRole: null,
                        topThingsToChange: '',
                        freeText: '',
                      }
                    }
                    canEdit={canEdit}
                  />
                </section>
              )}
            </>
          )
        })()
      )}
    </div>
  )
}
