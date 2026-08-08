import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  buildEmployeeChecklist,
  canEditEmployeeDocuments,
  canViewEmployeeDocuments,
  loadDocumentTemplates,
  loadEmployeeDocuments,
  summariseCompliance,
} from '@/lib/documents'
import { DocumentChecklist } from './DocumentChecklist'

export const dynamic = 'force-dynamic'

export default async function EmployeeDocumentsPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (!canViewEmployeeDocuments(session)) redirect('/')

  const employee = await findEmployeeById(params.id)
  if (!employee) notFound()

  const templates = loadDocumentTemplates()
  const documents = loadEmployeeDocuments()
  const rows = buildEmployeeChecklist({
    employeeId: employee.id,
    templates,
    documents,
  })
  const summary = summariseCompliance(rows, employee.id)
  const canEdit = canEditEmployeeDocuments(session)

  return (
    <div className="container-page py-8">
      <div className="mb-2">
        <Link href={`/employees/${employee.id}`} className="text-xs font-medium text-navy hover:underline">
          ← Back to employee
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">{employee.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {employee.designation} · {employee.department} · {employee.employeeCode}
          </p>
        </div>
        <SummaryCounters summary={summary} />
      </div>

      <DocumentChecklist
        employeeId={employee.id}
        rows={rows.map((r) => ({
          ...r,
          template: r.template,
          document: r.document,
        }))}
        canEdit={canEdit}
      />
    </div>
  )
}

function SummaryCounters({ summary }: { summary: { mandatoryMissing: number; optionalMissing: number; uploadedUnverified: number; expiring: number; expired: number } }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <Counter label="Missing (mandatory)" value={summary.mandatoryMissing} tone={summary.mandatoryMissing > 0 ? 'danger' : 'ok'} />
      <Counter label="Missing (optional)" value={summary.optionalMissing} tone="muted" />
      <Counter label="Awaiting verify" value={summary.uploadedUnverified} tone={summary.uploadedUnverified > 0 ? 'warning' : 'ok'} />
      <Counter label="Expiring (30d)" value={summary.expiring} tone={summary.expiring > 0 ? 'warning' : 'ok'} />
      <Counter label="Expired" value={summary.expired} tone={summary.expired > 0 ? 'danger' : 'ok'} />
    </div>
  )
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'ok' | 'warning' | 'danger' | 'muted'
}) {
  const className =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'muted'
          ? 'text-ink-3'
          : 'text-ink'
  return (
    <div>
      <div className={`text-2xl font-display tabular ${className}`}>{value}</div>
      <div className="text-xs uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  )
}
