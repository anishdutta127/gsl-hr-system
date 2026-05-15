'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IT_ASSET_STATUSES, type ITAssetAssignment, type ITAssetStatus } from '@/lib/types'

interface EmployeeOption {
  id: string
  name: string
  code: string
}

export function ITAssetActions({
  assetId,
  status,
  currentAssignment,
  employees,
  isAdmin,
}: {
  assetId: string
  status: ITAssetStatus
  currentAssignment: ITAssetAssignment | null
  employees: EmployeeOption[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [assignEmployeeId, setAssignEmployeeId] = useState('')
  const [returnReason, setReturnReason] = useState('')
  const [newStatus, setNewStatus] = useState<ITAssetStatus>(status)
  const [statusNotes, setStatusNotes] = useState('')

  async function call(body: unknown, label: string) {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/admin/it-assets/${encodeURIComponent(assetId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `${label} failed: ${res.status}`)
      setSuccess(data.note ?? 'Saved.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed.`)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Hard delete ${assetId}? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/it-assets/${encodeURIComponent(assetId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Delete failed: ${res.status}`)
      }
      router.push('/admin/it-assets')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 space-y-4 border-t border-line pt-4">
      {!currentAssignment ? (
        <div>
          <label htmlFor="assign-emp" className="text-xs font-semibold uppercase tracking-wider text-ink-3">
            Assign to employee
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <select
              id="assign-emp"
              value={assignEmployeeId}
              onChange={(e) => setAssignEmployeeId(e.target.value)}
              disabled={busy}
              className="min-h-[36px] flex-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            >
              <option value="">- pick an employee -</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.code && `(${e.code})`}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                call({ action: 'assign', employeeId: assignEmployeeId }, 'Assign')
              }
              disabled={busy || !assignEmployeeId}
              className="inline-flex min-h-[44px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
            >
              Assign
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="return-reason" className="text-xs font-semibold uppercase tracking-wider text-ink-3">
            Return reason
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              id="return-reason"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="exit, role change, repair return"
              disabled={busy}
              className="min-h-[36px] flex-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            />
            <button
              onClick={() =>
                call({ action: 'return', returnedReason: returnReason }, 'Return')
              }
              disabled={busy || !returnReason.trim()}
              className="inline-flex min-h-[44px] items-center rounded bg-success px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Mark returned
            </button>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="status-pick" className="text-xs font-semibold uppercase tracking-wider text-ink-3">
          Change status
        </label>
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            id="status-pick"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as ITAssetStatus)}
            disabled={busy}
            className="min-h-[36px] rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            {IT_ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
            placeholder="notes (optional)"
            disabled={busy}
            className="min-h-[36px] rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={() => call({ action: 'mark-status', status: newStatus, notes: statusNotes }, 'Status')}
          disabled={busy || newStatus === status}
          className="mt-2 inline-flex min-h-[44px] items-center rounded border border-line-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
        >
          Update status
        </button>
      </div>

      {isAdmin && (
        <div className="border-t border-line pt-3">
          <button
            onClick={remove}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded border border-danger px-3 py-1.5 text-sm text-danger hover:bg-danger-bg disabled:opacity-50"
          >
            Hard delete
          </button>
          <p className="mt-1 text-xs text-ink-3">Admin only. Removes the record entirely.</p>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
      {success && (
        <p className="text-xs text-success" role="status" aria-live="polite">
          {success}
        </p>
      )}
    </div>
  )
}
