import { notFound } from 'next/navigation'
import Link from 'next/link'
import { findEmployeeById, loadEmployees } from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate, formatRs } from '@/lib/format'
import { canViewEmployeeDocuments } from '@/lib/documents'
import { probationStatus } from '@/lib/probation'
import { loadOnboardingTasks, loadOnboardingTemplates, summariseOnboarding } from '@/lib/onboardingTasks'
import { loadOffboardingTasks, loadOffboardingTemplates, summariseOffboarding } from '@/lib/offboardingTasks'
import { assetsAssignedTo, loadAssets } from '@/lib/assets'
import { itAssetsAssignedTo } from '@/lib/itAssets'
import { loadITAssets } from '@/lib/data'
import {
  leaveYearForDate,
  loadLeaveApplications,
  proratedEntitlement,
  recalcBalance,
} from '@/lib/leave'
import { LEAVE_ENTITLEMENT_DEFAULTS } from '@/lib/types'
import { ExitInitiator } from './ExitInitiator'
import { SalaryStructureForm } from './SalaryStructureForm'
import { ProbationCard } from './ProbationCard'
import { EmployeeProfileEdit } from './EmployeeProfileEdit'

export const dynamic = 'force-dynamic'

export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const session = await requireRoles(['Admin', 'HR', 'Leadership'])
  const employee = await findEmployeeById(params.id)
  if (!employee) notFound()

  // Loaded here rather than inside the JSX IIFE below: that callback is
  // synchronous, so it cannot await, and the load has to happen once anyway.
  const allItAssets = await loadITAssets()

  const canEdit = session.role === 'Admin' || session.role === 'HR'
  // Leadership reads the page but does not see the salary breakdown - kept to
  // HR + Admin only per Phase 3 R2 spec.
  const canSeeSalary = session.role === 'Admin' || session.role === 'HR'

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/employees" className="hover:text-ink">
          Employees
        </Link>{' '}
        / {employee.name}
      </div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">{employee.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {employee.designation} · {employee.department} · {employee.location}
          </p>
          <p className="mt-1 text-xs text-ink-3">
            Employee code: <span className="tabular">{employee.employeeCode}</span> · Joined{' '}
            {formatDate(employee.dateOfJoining)} · Status:{' '}
            <span
              className={
                employee.status === 'Active'
                  ? 'inline-flex items-center rounded bg-teal-light px-2 py-0.5 text-xs font-medium text-teal-dark'
                  : 'inline-flex items-center rounded bg-surface px-2 py-0.5 text-xs text-ink-2'
              }
            >
              {employee.status}
            </span>
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="profile-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="profile-heading" className="font-display text-lg text-ink">
              Profile
            </h2>
            {canEdit && employee.status === 'Active' && (
              <EmployeeProfileEdit
                employeeId={employee.id}
                initial={{
                  title: employee.title ?? null,
                  phone: employee.phone ?? null,
                  location: employee.location ?? '',
                  workPattern: employee.workPattern ?? 'office-5day',
                  reportingTo: employee.reportingTo ?? null,
                  address: employee.address ?? null,
                  personalEmail: employee.personalEmail ?? null,
                  gender: employee.gender ?? null,
                  maritalStatus: employee.maritalStatus ?? null,
                }}
                knownLocations={[
                  ...new Set(
                    (await loadEmployees())
                      .map((e) => e.location)
                      .filter((l): l is string => !!l && l.length > 0),
                  ),
                ].sort()}
              />
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-line bg-card p-5 text-sm">
            <Term label="Email">{employee.email}</Term>
            <Term label="Mobile">{employee.phone ?? '-'}</Term>
            <Term label="Personal email">{employee.personalEmail ?? '-'}</Term>
            <Term label="Location">
              {employee.location || '-'}{' '}
              {employee.locationType && (
                <span className="ml-1 rounded-sm bg-surface px-1.5 py-0.5 text-[10px] text-ink-3">
                  {employee.locationType === 'office' ? 'Office' : 'Remote/field'}
                </span>
              )}
            </Term>
            <Term label="Work pattern">{employee.workPattern ?? 'office-5day'}</Term>
            <Term label="Reporting to">{employee.reportingTo ?? '-'}</Term>
            <Term label="Gender">{employee.gender ?? '-'}</Term>
            <Term label="Marital status">{employee.maritalStatus ?? '-'}</Term>
            <Term label="Address">
              <span className="whitespace-pre-wrap">{employee.address ?? '-'}</span>
            </Term>
            {canSeeSalary && (
              <Term label="Annual CTC">
                {employee.ctcAnnual != null ? formatRs(employee.ctcAnnual) : '-'}
              </Term>
            )}
            <Term label="Created">
              {formatDate(employee.createdAt)} by {employee.createdBy}
            </Term>
          </dl>

          {canSeeSalary && (
            <section className="mt-6 rounded-lg border border-line bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg text-ink">Salary structure</h2>
                  <p className="mt-1 text-xs text-ink-3">
                    Powers PF / PT auto-fill on the appointment letter. Indian rupees, annual amounts
                    unless marked monthly.
                  </p>
                </div>
                {canEdit && (
                  <div className="shrink-0">
                    <SalaryStructureForm
                      employeeId={employee.id}
                      initial={employee.salaryStructure ?? null}
                    />
                  </div>
                )}
              </div>
              {employee.salaryStructure ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Term label="CTC (annual)">{formatRs(employee.salaryStructure.ctc)}</Term>
                  <Term label="Basic (annual)">{formatRs(employee.salaryStructure.basic)}</Term>
                  <Term label="HRA (annual)">{formatRs(employee.salaryStructure.hra)}</Term>
                  <Term label="Conveyance (annual)">{formatRs(employee.salaryStructure.conveyance)}</Term>
                  <Term label="Other Allowances (annual)">{formatRs(employee.salaryStructure.otherAllowances)}</Term>
                  <Term label="PF Employee (annual)">{formatRs(employee.salaryStructure.pfEmployee)}</Term>
                  <Term label="PT (per month)">{formatRs(employee.salaryStructure.ptMonthly)}</Term>
                  <Term label="Net Take Home (annual)">{formatRs(employee.salaryStructure.netTakeHome)}</Term>
                </dl>
              ) : (
                <p className="mt-3 text-sm text-ink-2">
                  No salary structure stored. Letters will require manual entry until added.
                </p>
              )}
            </section>
          )}

          {employee.status === 'Active' && (() => {
            // Leave balance widget — computed from approved + pending leaves.
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
            const balance = recalcBalance({
              employeeId: employee.id,
              leaveYearStart: yearStart,
              applications: loadLeaveApplications(),
              entitlements: ent,
            })
            return (
              <Link
                href={`/employees/${employee.id}/leave`}
                className="mt-6 block rounded-lg border border-line bg-card p-5 hover:bg-surface"
              >
                <h2 className="font-display text-lg text-ink">Leave balance</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-ink-3">Casual</div>
                    <div className="font-display text-2xl tabular text-info">
                      {balance.casual.balance}
                      <span className="ml-1 text-sm text-ink-3">/ {balance.casual.entitlement}</span>
                    </div>
                    {balance.casual.pending > 0 && (
                      <div className="text-xs text-ink-3">{balance.casual.pending} pending</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-ink-3">Sick</div>
                    <div className="font-display text-2xl tabular text-warning">
                      {balance.sick.balance}
                      <span className="ml-1 text-sm text-ink-3">/ {balance.sick.entitlement}</span>
                    </div>
                    {balance.sick.pending > 0 && (
                      <div className="text-xs text-ink-3">{balance.sick.pending} pending</div>
                    )}
                  </div>
                </div>
                {balance.unpaid.taken > 0 && (
                  <p className="mt-2 text-xs text-warning">
                    Loss of pay year-to-date: {balance.unpaid.taken} day
                    {balance.unpaid.taken === 1 ? '' : 's'}
                  </p>
                )}
              </Link>
            )
          })()}

          {employee.status === 'Active' && (() => {
            const obTasks = loadOnboardingTasks().filter((t) => t.employeeId === employee.id)
            const tplList = loadOnboardingTemplates()
            const summary = summariseOnboarding({ templates: tplList, tasks: obTasks })
            const denom = summary.total - summary.notApplicable
            const pct = denom === 0 ? 0 : Math.round((summary.completed / denom) * 100)
            return (
              <Link
                href={`/employees/${employee.id}/onboarding`}
                className="mt-6 block rounded-lg border border-line bg-card p-5 hover:bg-surface"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-lg text-ink">Onboarding</h2>
                  {summary.isOnboarded && summary.total > 0 && (
                    <span className="rounded-sm bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
                      Complete
                    </span>
                  )}
                </div>
                {summary.total === 0 ? (
                  <p className="mt-2 text-sm text-ink-2">
                    No onboarding tasks yet. Open to {canEdit ? 'generate the default checklist' : 'view'} →
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-ink-2">
                      {summary.completed} of {denom} mandatory complete
                      {summary.blocked > 0 && (
                        <span className="ml-2 text-warning">· {summary.blocked} blocked</span>
                      )}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded bg-line">
                      <div
                        className={summary.isOnboarded ? 'h-full bg-success' : 'h-full bg-orange'}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                )}
              </Link>
            )
          })()}

          {(() => {
            const offTasks = loadOffboardingTasks().filter((t) => t.employeeId === employee.id)
            if (offTasks.length === 0) return null
            const offTpls = loadOffboardingTemplates()
            const offSummary = summariseOffboarding({ templates: offTpls, tasks: offTasks })
            const denom = offSummary.total - offSummary.notApplicable
            const pct = denom === 0 ? 0 : Math.round((offSummary.completed / denom) * 100)
            return (
              <Link
                href={`/employees/${employee.id}/offboarding`}
                className="mt-6 block rounded-lg border border-line bg-card p-5 hover:bg-surface"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-lg text-ink">Offboarding</h2>
                  {offSummary.isOffboarded && (
                    <span className="rounded-sm bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
                      Complete
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  {offSummary.completed} of {denom} mandatory complete
                  {offSummary.blocked > 0 && (
                    <span className="ml-2 text-warning">· {offSummary.blocked} blocked</span>
                  )}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-line">
                  <div
                    className={offSummary.isOffboarded ? 'h-full bg-success' : 'h-full bg-orange'}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
            )
          })()}

          {(() => {
            const assigned = assetsAssignedTo(loadAssets(), employee.id)
            if (assigned.length === 0) return null
            return (
              <section className="mt-6 rounded-lg border border-line bg-card p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-lg text-ink">Assets ({assigned.length})</h2>
                  {canEdit && (
                    <Link href="/admin/assets" className="text-xs font-medium text-navy hover:underline">
                      Manage →
                    </Link>
                  )}
                </div>
                <ul className="mt-3 divide-y divide-line">
                  {assigned.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                      <span>
                        <span className="font-medium text-ink">{a.type}</span>
                        <span className="ml-2 text-xs text-ink-3 tabular">{a.identifier}</span>
                      </span>
                      <span className="text-xs text-ink-3">
                        {a.condition} · assigned {a.assignedAt?.slice(0, 10)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })()}

          {(() => {
            const itAssigned = itAssetsAssignedTo(allItAssets, employee.id)
            return (
              <section className="mt-6 rounded-lg border border-line bg-card p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-lg text-ink">IT assets ({itAssigned.length})</h2>
                  {canEdit && (
                    <Link href="/admin/it-assets" className="text-xs font-medium text-navy hover:underline">
                      Manage →
                    </Link>
                  )}
                </div>
                {itAssigned.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-3">No IT hardware assigned.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {itAssigned.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                        <span>
                          <Link
                            href={`/admin/it-assets/${a.id}`}
                            className="font-medium text-navy hover:underline"
                          >
                            {a.id}
                          </Link>
                          <span className="ml-2 text-ink">{a.make} {a.model}</span>
                          <span className="ml-2 text-xs text-ink-3 tabular">{a.serialNumber}</span>
                        </span>
                        <span className="text-xs text-ink-3">
                          {a.category} · assigned {a.currentAssignment?.assignedAt.slice(0, 10)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })()}

          {employee.exit ? (
            <section className="mt-6 rounded-lg border border-line bg-card p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg text-ink">Exit</h2>
                <Link
                  href={`/exits/${employee.id}/handover`}
                  className="text-xs font-medium text-navy hover:underline"
                >
                  Open handover →
                </Link>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Term label="Last working day">{formatDate(employee.exit.lastWorkingDay)}</Term>
                <Term label="Reason">{employee.exit.reason}</Term>
                <Term label="Relieving letter">
                  {employee.exit.relievingLetterIssued ? 'Issued' : 'Pending'}
                </Term>
                <Term label="Experience letter">
                  {employee.exit.experienceLetterIssued ? 'Issued' : 'Pending'}
                </Term>
              </dl>
              {employee.exit.notes ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink-2">
                  {employee.exit.notes}
                </p>
              ) : null}
            </section>
          ) : null}
        </section>

        <aside className="space-y-4">
          <ProbationCard
            employeeId={employee.id}
            status={probationStatus(employee)}
            canEdit={canEdit}
          />

          {canViewEmployeeDocuments(session) && (
            <Link
              href={`/employees/${employee.id}/documents`}
              className="block rounded-lg border border-line bg-card p-5 hover:bg-surface"
            >
              <h2 className="font-display text-lg text-ink">Documents</h2>
              <p className="mt-1 text-sm text-ink-2">
                Open the document checklist for this employee →
              </p>
            </Link>
          )}

          {employee.status === 'Active' && canEdit ? (
            <div id="exit" className="scroll-mt-20">
              <ExitInitiator employeeId={employee.id} />
            </div>
          ) : null}

          <div className="rounded-lg border border-line bg-card p-5">
            <h2 className="font-display text-lg text-ink">Audit trail</h2>
            <ol className="mt-3 space-y-2">
              {[...employee.auditLog].reverse().slice(0, 20).map((entry, idx) => (
                <li key={idx} className="text-sm">
                  <div className="font-medium text-ink">{entry.action}</div>
                  {entry.notes && (
                    <div className="text-xs text-ink-2">{entry.notes}</div>
                  )}
                  <div className="text-xs text-ink-3">
                    {formatDate(entry.timestamp)} · by {entry.user}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </>
  )
}
