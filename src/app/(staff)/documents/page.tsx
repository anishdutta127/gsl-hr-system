import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees } from '@/lib/data'
import {
  buildEmployeeChecklist,
  canViewEmployeeDocuments,
  loadDocumentTemplates,
  loadEmployeeDocuments,
  summariseCompliance,
} from '@/lib/documents'

export const dynamic = 'force-dynamic'

export default async function DocumentsAggregatePage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (!canViewEmployeeDocuments(session)) redirect('/')

  const employees = loadEmployees().filter((e) => e.status !== 'Exited')
  const templates = loadDocumentTemplates()
  const documents = loadEmployeeDocuments()

  const rows = employees
    .map((emp) => {
      const checklist = buildEmployeeChecklist({
        employeeId: emp.id,
        templates,
        documents,
      })
      return { emp, summary: summariseCompliance(checklist, emp.id) }
    })
    .sort((a, b) => {
      if (a.summary.mandatoryMissing !== b.summary.mandatoryMissing) {
        return b.summary.mandatoryMissing - a.summary.mandatoryMissing
      }
      if (a.summary.expired !== b.summary.expired) return b.summary.expired - a.summary.expired
      return a.emp.name.localeCompare(b.emp.name)
    })

  const totals = rows.reduce(
    (acc, r) => {
      acc.mandatoryMissing += r.summary.mandatoryMissing
      acc.expiring += r.summary.expiring
      acc.expired += r.summary.expired
      acc.unverified += r.summary.uploadedUnverified
      acc.fullyCompliant += r.summary.mandatoryMissing === 0 && r.summary.expired === 0 ? 1 : 0
      return acc
    },
    { mandatoryMissing: 0, expiring: 0, expired: 0, unverified: 0, fullyCompliant: 0 },
  )

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Document compliance</h1>
        <p className="mt-1 text-sm text-ink-2">
          Snapshot of every active employee's document repository. Click a row for the per-employee
          checklist.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Fully compliant" value={totals.fullyCompliant} tone="ok" />
        <Stat label="Missing mandatory" value={totals.mandatoryMissing} tone="danger" />
        <Stat label="Awaiting verify" value={totals.unverified} tone="warning" />
        <Stat label="Expiring (30d)" value={totals.expiring} tone="warning" />
        <Stat label="Expired" value={totals.expired} tone="danger" />
      </div>

      <div className="rounded-lg border border-line bg-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
              <th className="px-5 py-2">Employee</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2 text-right">Missing (mand.)</th>
              <th className="px-3 py-2 text-right">Awaiting verify</th>
              <th className="px-3 py-2 text-right">Expiring</th>
              <th className="px-3 py-2 text-right">Expired</th>
              <th className="px-5 py-2 text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ emp, summary }) => (
              <tr key={emp.id} className="border-b border-line/50 hover:bg-surface">
                <td className="px-5 py-2">
                  <div className="font-medium text-ink">{emp.name}</div>
                  <div className="text-xs text-ink-3 tabular">{emp.employeeCode}</div>
                </td>
                <td className="px-3 py-2 text-ink-2">{emp.department}</td>
                <td className="px-3 py-2 text-right tabular">
                  <span className={summary.mandatoryMissing > 0 ? 'text-danger font-medium' : 'text-ink-3'}>
                    {summary.mandatoryMissing}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular">
                  <span className={summary.uploadedUnverified > 0 ? 'text-warning font-medium' : 'text-ink-3'}>
                    {summary.uploadedUnverified}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular">
                  <span className={summary.expiring > 0 ? 'text-warning font-medium' : 'text-ink-3'}>
                    {summary.expiring}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular">
                  <span className={summary.expired > 0 ? 'text-danger font-medium' : 'text-ink-3'}>
                    {summary.expired}
                  </span>
                </td>
                <td className="px-5 py-2 text-right">
                  <Link
                    href={`/employees/${emp.id}/documents`}
                    className="text-xs font-medium text-navy hover:text-navy-dark"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warning' | 'danger' }) {
  const colors =
    tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-success'
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className={`font-display text-3xl tabular ${colors}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  )
}
