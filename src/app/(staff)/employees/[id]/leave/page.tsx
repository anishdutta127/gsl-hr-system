import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  leaveYearForDate,
  loadLeaveApplications,
  proratedEntitlement,
  recalcBalance,
} from '@/lib/leave'
import { LEAVE_ENTITLEMENT_DEFAULTS } from '@/lib/types'
import { LeaveApplyForm } from './LeaveApplyForm'
import { LeaveHistory } from './LeaveHistory'

export const dynamic = 'force-dynamic'

export default async function EmployeeLeavePage({ params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const employee = findEmployeeById(params.id)
  if (!employee) notFound()

  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isLeadership = session.role === 'Leadership'
  const isOwnReport = session.role === 'HOD' && employee.reportingManagerId === session.sub
  if (!isHrOrAdmin && !isLeadership && !isOwnReport) redirect('/')

  const today = new Date().toISOString().slice(0, 10)
  const yearStart = leaveYearForDate(today)
  const ent = {
    casual: proratedEntitlement({
      fullEntitlement: LEAVE_ENTITLEMENT_DEFAULTS.casual,
      yearStart,
      joiningDate: employee.dateOfJoining,
    }),
    sick: proratedEntitlement({
      fullEntitlement: LEAVE_ENTITLEMENT_DEFAULTS.sick,
      yearStart,
      joiningDate: employee.dateOfJoining,
    }),
  }

  const allApps = loadLeaveApplications()
  const myApps = allApps.filter((a) => a.employeeId === employee.id)
  const balance = recalcBalance({
    employeeId: employee.id,
    leaveYearStart: yearStart,
    applications: allApps,
    entitlements: ent,
  })

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
        <h1 className="font-display text-2xl text-ink">{employee.name} — Leave</h1>
        <p className="mt-1 text-sm text-ink-2">
          Leave year {yearStart.slice(0, 4)}-{(Number(yearStart.slice(0, 4)) + 1).toString().slice(2)} ·
          {' '}
          {employee.workPattern ?? 'office-5day'}
          {employee.dateOfJoining && employee.dateOfJoining > yearStart && (
            <span className="ml-2 rounded-sm bg-warning-bg px-1.5 py-0.5 text-xs text-warning">
              Prorated entitlement
            </span>
          )}
        </p>
      </div>

      <BalanceCards balance={balance} />

      {isHrOrAdmin && (
        <section className="mt-6">
          <h2 className="mb-3 font-display text-lg text-ink">Apply leave on behalf</h2>
          <LeaveApplyForm
            employeeId={employee.id}
            employeeName={employee.name}
            workPattern={employee.workPattern ?? 'office-5day'}
            isHrOrAdmin={isHrOrAdmin}
          />
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg text-ink">History</h2>
        <LeaveHistory
          applications={myApps}
          canActOn={isHrOrAdmin}
          canApprove={isHrOrAdmin || isOwnReport}
          isOwnReport={isOwnReport}
          currentUserId={session.sub}
        />
      </section>
    </div>
  )
}

function BalanceCards({
  balance,
}: {
  balance: ReturnType<typeof recalcBalance>
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <BalanceCard
        title="Casual leave"
        bucket={balance.casual}
        tint="bg-info-bg"
        accent="text-info"
      />
      <BalanceCard
        title="Sick leave"
        bucket={balance.sick}
        tint="bg-warning-bg"
        accent="text-warning"
      />
      <div className="rounded-lg border border-line bg-card p-5">
        <div className="text-xs uppercase tracking-wider text-ink-3">Loss of Pay (year-to-date)</div>
        <div className="mt-1 font-display text-3xl tabular text-ink">{balance.unpaid.taken}</div>
        <p className="mt-1 text-xs text-ink-3">
          Days taken without balance backing. Adjusts payroll calculations downstream.
        </p>
      </div>
    </div>
  )
}

function BalanceCard({
  title,
  bucket,
  tint,
  accent,
}: {
  title: string
  bucket: { entitlement: number; taken: number; pending: number; balance: number }
  tint: string
  accent: string
}) {
  const usedFraction =
    bucket.entitlement === 0 ? 0 : Math.min(1, (bucket.taken + bucket.pending) / bucket.entitlement)
  return (
    <div className={`rounded-lg border border-line ${tint} p-5`}>
      <div className="text-xs uppercase tracking-wider text-ink-3">{title}</div>
      <div className={`mt-1 font-display text-3xl tabular ${accent}`}>
        {bucket.balance}
        <span className="ml-1 text-base text-ink-3">/ {bucket.entitlement}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded bg-card/60">
        <div className={accent.replace('text-', 'bg-')} style={{ width: `${usedFraction * 100}%`, height: '100%' }} />
      </div>
      <p className="mt-2 text-xs text-ink-3 tabular">
        Taken {bucket.taken} · Pending {bucket.pending}
      </p>
    </div>
  )
}
