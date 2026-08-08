import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRoles } from '@/lib/guards'
import {
  findRecognitionById,
  loadEmployees,
  loadUsers,
} from '@/lib/data'
import { formatMonthLabel } from '@/lib/recognition'
import { loadCompany } from '@/lib/company'
import { formatDate } from '@/lib/format'
import { RecognitionAdminControls } from './RecognitionAdminControls'

export const dynamic = 'force-dynamic'

export default async function AdminRecognitionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireRoles(['Admin', 'HR'])
  const rec = await findRecognitionById(params.id)
  if (!rec) notFound()
  const company = loadCompany()

  const users = await loadUsers()
  const employees = await loadEmployees()
  const user = users.find((u) => u.id === rec.employeeId)
  const employee = user
    ? employees.find((e) => e.email.toLowerCase() === user.email.toLowerCase())
    : employees.find((e) => e.id === rec.employeeId)
  const employeeName = employee?.name ?? user?.name ?? 'Recognised Employee'
  const employeeDesignation = employee?.designation ?? ''

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/admin/recognition" className="hover:text-ink">
          Recognition nominations
        </Link>{' '}
        / {rec.id}
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">{employeeName}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {employeeDesignation} · {rec.department} · {rec.category} ·{' '}
            {formatMonthLabel(rec.month)}
          </p>
          <p className="mt-1 text-xs text-ink-3 tabular">
            {rec.id} · Nominated {formatDate(rec.nominatedAt)}
          </p>
        </div>
        <span className="inline-flex items-center rounded-sm bg-surface px-2 py-1 text-xs font-medium uppercase tracking-wider text-ink-2">
          {rec.status}
        </span>
      </div>

      <RecognitionAdminControls
        recognition={rec}
        employeeName={employeeName}
        companyName={company.name}
        parentGroupName={company.parentGroup}
        actorEmail={session.email}
      />

      <section className="mt-6 rounded-lg border border-line bg-card p-5" aria-labelledby="writeup-h">
        <h2 id="writeup-h" className="font-display text-base text-ink">Write-up</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{rec.writeup}</p>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-card p-5" aria-labelledby="audit-h">
        <h2 id="audit-h" className="font-display text-base text-ink">Audit log</h2>
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-xs text-ink-2">
          {rec.auditLog
            .slice()
            .reverse()
            .map((entry, i) => (
              <li key={i} className="rounded bg-surface px-2 py-1 tabular">
                <span className="text-ink-3">{entry.timestamp.slice(0, 19).replace('T', ' ')}</span>{' '}
                <span className="font-medium text-ink">{entry.user}</span> -{' '}
                <span className="text-ink-2">{entry.action}</span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}
