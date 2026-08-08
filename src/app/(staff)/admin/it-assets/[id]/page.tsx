import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import {
  canManageITAssets,
  canViewITAssets,
} from '@/lib/itAssets'
import { findITAssetById, loadEmployees } from '@/lib/data'
import { formatDate } from '@/lib/format'
import { ITAssetActions } from './ITAssetActions'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
}

export default async function ITAssetDetailPage({ params }: Props) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (!canViewITAssets(session)) redirect('/')

  const asset = await findITAssetById(params.id)
  if (!asset) notFound()

  const employees = await loadEmployees()
  const empById = new Map(employees.map((e) => [e.id, e]))
  const canEdit = canManageITAssets(session)
  const isAdmin = session.role === 'Admin'

  const currentEmp = asset.currentAssignment ? empById.get(asset.currentAssignment.employeeId) : null

  return (
    <div className="container-page py-8">
      <Link href="/admin/it-assets" className="text-sm text-navy hover:underline">
        ← Back to IT assets
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink tabular">{asset.id}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {asset.category} - {asset.make} {asset.model}
          </p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center rounded-sm bg-surface px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-ink-2">
            {asset.status}
          </span>
          <p className="mt-1 text-xs text-ink-3">Condition: {asset.condition}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="asset-details-h">
          <h2 id="asset-details-h" className="font-display text-base text-ink">Details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Detail label="Serial number" value={asset.serialNumber || '-'} />
            <Detail label="Asset tag" value={asset.assetTag || '-'} />
            <Detail label="Purchase date" value={asset.purchaseDate ? formatDate(asset.purchaseDate) : '-'} />
            <Detail label="Purchase cost" value={asset.purchaseCost != null ? `Rs ${formatINR(asset.purchaseCost)}` : '-'} />
            <Detail label="Warranty end" value={asset.warrantyEndDate ? formatDate(asset.warrantyEndDate) : '-'} />
            <Detail label="Location" value={asset.location || '-'} />
            <Detail label="Created" value={`${formatDate(asset.createdAt)} by ${asset.createdBy}`} />
            <Detail label="Updated" value={formatDate(asset.updatedAt)} />
          </dl>
          {asset.notes && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3">Notes</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{asset.notes}</p>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="asset-assign-h">
          <h2 id="asset-assign-h" className="font-display text-base text-ink">Assignment</h2>
          {asset.currentAssignment ? (
            <div className="mt-3 text-sm">
              <p className="text-ink">
                Currently assigned to{' '}
                <Link
                  href={`/employees/${asset.currentAssignment.employeeId}`}
                  className="font-medium text-navy hover:underline"
                >
                  {currentEmp?.name ?? asset.currentAssignment.employeeId}
                </Link>
              </p>
              <p className="mt-1 text-xs text-ink-3">
                Assigned {formatDate(asset.currentAssignment.assignedAt)} by{' '}
                {asset.currentAssignment.assignedBy}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-2">Currently unassigned.</p>
          )}

          {canEdit && (
            <ITAssetActions
              assetId={asset.id}
              status={asset.status}
              currentAssignment={asset.currentAssignment}
              employees={employees
                .filter((e) => e.status !== 'Exited')
                .map((e) => ({ id: e.id, name: e.name, code: e.employeeCode ?? '' }))}
              isAdmin={isAdmin}
            />
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-line bg-card p-5" aria-labelledby="asset-history-h">
        <h2 id="asset-history-h" className="font-display text-base text-ink">Assignment history</h2>
        {asset.assignmentHistory.length === 0 ? (
          <p className="mt-3 text-sm text-ink-3">No previous assignments.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {asset.assignmentHistory
              .slice()
              .reverse()
              .map((h, i) => {
                const emp = empById.get(h.employeeId)
                return (
                  <li key={i} className="py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-ink">
                        {emp?.name ?? h.employeeId}
                      </span>
                      <span className="text-xs text-ink-3">
                        {formatDate(h.assignedAt)} → {formatDate(h.returnedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-2">Returned: {h.returnedReason}</p>
                  </li>
                )
              })}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-line bg-card p-5" aria-labelledby="asset-audit-h">
        <h2 id="asset-audit-h" className="font-display text-base text-ink">Audit log</h2>
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-xs text-ink-2">
          {asset.auditLog
            .slice()
            .reverse()
            .map((entry, i) => (
              <li key={i} className="rounded bg-surface px-2 py-1 tabular">
                <span className="text-ink-3">{entry.timestamp.slice(0, 19).replace('T', ' ')}</span>{' '}
                <span className="font-medium text-ink">{entry.user}</span> -{' '}
                <span className="text-ink-2">{entry.action}</span>
                {entry.notes && <span className="text-ink-3"> ({entry.notes})</span>}
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-xs uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="text-sm text-ink text-right">{value}</dd>
    </div>
  )
}

function formatINR(n: number): string {
  // Indian comma grouping: 12,34,567.
  const s = String(Math.round(n))
  if (s.length <= 3) return s
  const lastThree = s.slice(-3)
  const rest = s.slice(0, -3)
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
}
