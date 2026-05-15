'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IT_ASSET_CATEGORIES,
  IT_ASSET_STATUSES,
  type ITAsset,
  type ITAssetCategory,
  type ITAssetStatus,
} from '@/lib/types'
import { matchesITAssetQuery } from '@/lib/itAssetsPure'
import { CreateITAssetForm } from './CreateITAssetForm'
import { BulkImportPanel } from './BulkImportPanel'

interface EmployeeRef {
  id: string
  name: string
  code: string
  status: string
}

export function ITAssetsTable({
  assets,
  employees,
  canEdit,
  statusTone,
}: {
  assets: ITAsset[]
  employees: EmployeeRef[]
  canEdit: boolean
  statusTone: Record<ITAssetStatus, string>
}) {
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])
  const [category, setCategory] = useState<ITAssetCategory | ''>('')
  const [status, setStatus] = useState<ITAssetStatus | ''>('')
  const [assignee, setAssignee] = useState<string>('')
  const [q, setQ] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showBulk, setShowBulk] = useState(false)

  const filtered = assets.filter((a) => {
    if (category && a.category !== category) return false
    if (status && a.status !== status) return false
    if (assignee === '__unassigned__' && a.currentAssignment) return false
    if (assignee && assignee !== '__unassigned__' && a.currentAssignment?.employeeId !== assignee)
      return false
    if (q && !matchesITAssetQuery(a, q)) return false
    return true
  })

  function exportCSV() {
    const headers = [
      'id',
      'category',
      'make',
      'model',
      'serialNumber',
      'assetTag',
      'status',
      'condition',
      'location',
      'assignedTo',
      'assignedEmployeeName',
      'assignedAt',
      'purchaseDate',
      'purchaseCost',
      'warrantyEndDate',
      'notes',
    ]
    const lines = [headers.join(',')]
    for (const a of filtered) {
      const emp = a.currentAssignment ? empById.get(a.currentAssignment.employeeId) : null
      lines.push(
        [
          a.id,
          a.category,
          csvCell(a.make),
          csvCell(a.model),
          csvCell(a.serialNumber),
          csvCell(a.assetTag),
          a.status,
          a.condition,
          csvCell(a.location),
          a.currentAssignment?.employeeId ?? '',
          csvCell(emp?.name ?? ''),
          a.currentAssignment?.assignedAt ?? '',
          a.purchaseDate ?? '',
          a.purchaseCost != null ? String(a.purchaseCost) : '',
          a.warrantyEndDate ?? '',
          csvCell(a.notes),
        ].join(','),
      )
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `it-assets-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded-lg border border-line bg-card">
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <div>
          <label htmlFor="ia-search" className="block text-xs font-medium uppercase tracking-wider text-ink-3">Search</label>
          <input
            id="ia-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="serial, make, tag"
            className="mt-1 min-h-[36px] rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="ia-cat" className="block text-xs font-medium uppercase tracking-wider text-ink-3">Category</label>
          <select
            id="ia-cat"
            value={category}
            onChange={(e) => setCategory((e.target.value as ITAssetCategory | '') || '')}
            className="mt-1 min-h-[36px] rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {IT_ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ia-status" className="block text-xs font-medium uppercase tracking-wider text-ink-3">Status</label>
          <select
            id="ia-status"
            value={status}
            onChange={(e) => setStatus((e.target.value as ITAssetStatus | '') || '')}
            className="mt-1 min-h-[36px] rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {IT_ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ia-assignee" className="block text-xs font-medium uppercase tracking-wider text-ink-3">Assignee</label>
          <select
            id="ia-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="mt-1 min-h-[36px] rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="__unassigned__">- Unassigned -</option>
            {employees
              .filter((e) => e.status !== 'Exited')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </div>
        <button
          onClick={exportCSV}
          className="ml-auto inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          Export CSV
        </button>
        {canEdit && (
          <>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex min-h-[44px] items-center rounded bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy-dark"
            >
              {showCreate ? 'Close' : '+ Add asset'}
            </button>
            <button
              onClick={() => setShowBulk((v) => !v)}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
            >
              {showBulk ? 'Close import' : 'Bulk import'}
            </button>
          </>
        )}
      </div>

      {showCreate && canEdit && (
        <CreateITAssetForm onClose={() => setShowCreate(false)} />
      )}
      {showBulk && canEdit && (
        <BulkImportPanel onClose={() => setShowBulk(false)} />
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
              <th className="px-5 py-2">ID</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Make / Model</th>
              <th className="px-3 py-2">Serial</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Assigned to</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-5 py-2 text-right">View</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const emp = a.currentAssignment ? empById.get(a.currentAssignment.employeeId) : null
              return (
                <tr key={a.id} className="border-b border-line/50 align-top">
                  <td className="px-5 py-3 font-medium tabular text-navy">
                    <Link href={`/admin/it-assets/${a.id}`} className="hover:underline">
                      {a.id}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-ink-2">{a.category}</td>
                  <td className="px-3 py-3">
                    <span className="font-medium text-ink">{a.make}</span>{' '}
                    <span className="text-ink-2">{a.model}</span>
                  </td>
                  <td className="px-3 py-3 tabular text-xs text-ink-2">{a.serialNumber}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${statusTone[a.status]}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {emp ? (
                      <span>
                        <span className="font-medium text-ink">{emp.name}</span>
                        {emp.code && <span className="ml-2 text-xs text-ink-3 tabular">{emp.code}</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-3">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-2">{a.location || '-'}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/it-assets/${a.id}`}
                      className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-6 text-center text-sm text-ink-3">
                  No IT assets match the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function csvCell(v: string): string {
  // Wrap in quotes if it contains comma, quote, or newline. Escape quotes.
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}
