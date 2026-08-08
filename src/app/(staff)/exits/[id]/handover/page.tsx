import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById, findITAssetById, loadITAssets } from '@/lib/data'
import {
  canEditHandover,
  canReviewHandover,
  emptyHandover,
  handoverStatus,
  loadExitHandovers,
} from '@/lib/exitHandover'
import { itAssetHistoryFor } from '@/lib/itAssets'
import { formatDate } from '@/lib/format'
import { HandoverEditor } from './HandoverEditor'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
}

export default async function ExitHandoverPage({ params }: Props) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const employee = await findEmployeeById(params.id)
  if (!employee) notFound()

  const editable = canEditHandover(session, {
    reportingManagerId: employee.reportingManagerId ?? null,
  })
  const isReviewer = canReviewHandover(session)

  // Read-only access: HR/Admin/Leadership see all; HOD only when they are RM.
  if (
    session.role !== 'Admin' &&
    session.role !== 'HR' &&
    session.role !== 'Leadership' &&
    !(session.role === 'HOD' && employee.reportingManagerId === session.sub)
  ) {
    redirect('/')
  }

  const now = new Date().toISOString()
  const handover =
    loadExitHandovers().find((h) => h.employeeId === employee.id) ??
    emptyHandover(employee.id, now)
  const status = handoverStatus(handover)

  // IT assets historically attached to this employee - lets HR tick which
  // ones have been returned right from the handover view.
  const itAssets = itAssetHistoryFor(await loadITAssets(), employee.id).map((a) => ({
    id: a.id,
    label: `${a.id} - ${a.make} ${a.model} (${a.serialNumber})`,
    currentlyAssigned: a.currentAssignment?.employeeId === employee.id,
  }))

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/exits" className="hover:text-ink">
          Exits
        </Link>{' '}
        / {employee.name} / Handover
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Exit handover - {employee.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {employee.designation} · {employee.department} ·{' '}
            {employee.exit?.lastWorkingDay ? `LWD ${formatDate(employee.exit.lastWorkingDay)}` : 'LWD pending'}
          </p>
        </div>
        <div className="text-right">
          <span className={`inline-flex items-center rounded-sm px-2 py-1 text-xs font-medium ${badgeTone(status)}`}>
            {status}
          </span>
          {handover.reviewedAt && (
            <p className="mt-1 text-xs text-ink-3">
              Reviewed {formatDate(handover.reviewedAt)} by {handover.reviewedBy}
            </p>
          )}
        </div>
      </div>

      <HandoverEditor
        employeeId={employee.id}
        employeeName={employee.name}
        initialHandover={handover}
        canEdit={editable}
        canReview={isReviewer}
        itAssetOptions={itAssets}
      />
    </div>
  )
}

function badgeTone(status: string): string {
  switch (status) {
    case 'Reviewed':
      return 'bg-success-bg text-success'
    case 'Submitted':
      return 'bg-navy-light text-navy'
    case 'In progress':
      return 'bg-warning-bg text-warning'
    default:
      return 'bg-surface text-ink-3'
  }
}
