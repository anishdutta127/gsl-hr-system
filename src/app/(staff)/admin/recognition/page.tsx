import Link from 'next/link'
import { requireRoles } from '@/lib/guards'
import { loadEmployees, loadRecognitions, loadUsers } from '@/lib/data'
import { formatMonthLabel, groupByMonth } from '@/lib/recognition'
import type { Recognition, RecognitionStatus } from '@/lib/types'
import { RecognitionRow } from './RecognitionRow'

export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<RecognitionStatus, string> = {
  Draft: 'border-line text-ink-2 bg-surface',
  Nominated: 'border-warning text-ink bg-warning-bg',
  Approved: 'border-success text-success bg-success-bg',
  Published: 'border-navy text-navy bg-navy-light',
  Archived: 'border-line-strong text-ink-3 bg-surface',
}

export default async function AdminRecognitionPage() {
  await requireRoles(['Admin', 'HR'])
  const recognitions = loadRecognitions()
  const users = loadUsers()
  const employees = loadEmployees()

  // Sort newest month first; within a month, newest nomination first.
  const grouped = groupByMonth(recognitions)
  const months = Array.from(grouped.keys()).sort().reverse()

  const userById = new Map(users.map((u) => [u.id, u]))
  // employees keyed by user-id-of-matching-user OR raw employee id.
  const employeeByUserId = new Map<string, (typeof employees)[number]>()
  for (const e of employees) {
    const u = users.find((u) => u.email.toLowerCase() === e.email.toLowerCase())
    if (u) employeeByUserId.set(u.id, e)
  }

  function lookupEmployee(rec: Recognition) {
    return (
      employeeByUserId.get(rec.employeeId) ??
      employees.find((e) => e.id === rec.employeeId)
    )
  }

  return (
    <div className="container-page py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Recognition nominations</h1>
          <p className="mt-1 text-sm text-ink-2">
            Review HOD submissions, edit the write-up if needed, and approve to make the
            recognition card available. Approved cards can be published via email from
            the card view.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/recognition/nominate"
            className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            New nomination
          </Link>
          <Link
            href="/admin/recognition/nominations/new"
            className="inline-flex min-h-[44px] items-center rounded bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            Request HOD nominations
          </Link>
        </div>
      </div>

      {recognitions.length === 0 && (
        <div
          role="status"
          className="mt-8 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center"
        >
          <p className="text-sm font-medium text-ink">No nominations yet.</p>
          <p className="mt-1 text-xs text-ink-3">
            Use {`'`}Request HOD nominations{`'`} to seed the monthly email round, or
            submit one directly from {`'`}New nomination{`'`}.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-8">
        {months.map((month) => {
          const list = (grouped.get(month) ?? []).slice().sort((a, b) => {
            // newest nomination first within the month
            return b.nominatedAt.localeCompare(a.nominatedAt)
          })
          return (
            <section key={month}>
              <h2 className="font-display text-lg text-ink">{formatMonthLabel(month)}</h2>
              <ul className="mt-3 space-y-3">
                {list.map((rec) => {
                  const employee = lookupEmployee(rec)
                  const nominator = userById.get(rec.nominatedBy)
                  return (
                    <li key={rec.id}>
                      <RecognitionRow
                        recognition={rec}
                        employeeName={employee?.name ?? rec.employeeId}
                        employeeDesignation={employee?.designation ?? ''}
                        nominatorName={nominator?.name ?? rec.nominatedBy}
                        statusToneClass={STATUS_TONE[rec.status]}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
