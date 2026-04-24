import { notFound } from 'next/navigation'
import Link from 'next/link'
import { findEmployeeById } from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate, formatRs } from '@/lib/format'
import { OnboardingChecklist } from './OnboardingChecklist'
import { ExitInitiator } from './ExitInitiator'

export const dynamic = 'force-dynamic'

export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const session = await requireRoles(['Admin', 'HR', 'Leadership'])
  const employee = findEmployeeById(params.id)
  if (!employee) notFound()

  const canEdit = session.role === 'Admin' || session.role === 'HR'

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
          <h2 id="profile-heading" className="mb-3 font-display text-lg text-ink">
            Profile
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-line bg-card p-5 text-sm">
            <Term label="Email">{employee.email}</Term>
            <Term label="Phone">{employee.phone ?? '—'}</Term>
            <Term label="Reporting to">{employee.reportingTo ?? '—'}</Term>
            <Term label="Annual CTC">
              {employee.ctcAnnual != null ? formatRs(employee.ctcAnnual) : '—'}
            </Term>
            <Term label="Created">
              {formatDate(employee.createdAt)} by {employee.createdBy}
            </Term>
          </dl>

          {employee.status === 'Active' ? (
            <div className="mt-6">
              <h2 className="mb-3 font-display text-lg text-ink">Onboarding checklist</h2>
              <OnboardingChecklist
                employeeId={employee.id}
                items={employee.onboardingChecklist ?? []}
                canEdit={canEdit}
              />
            </div>
          ) : null}

          {employee.exit ? (
            <section className="mt-6 rounded-lg border border-line bg-card p-5">
              <h2 className="font-display text-lg text-ink">Exit</h2>
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
          {employee.status === 'Active' && canEdit ? (
            <ExitInitiator employeeId={employee.id} />
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
