'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ASSET_CONDITIONS,
  ASSET_TYPES,
  type Asset,
  type AssetCondition,
  type AssetType,
} from '@/lib/types'

interface EmployeeRef {
  id: string
  name: string
  code: string
  status: string
}

const CONDITION_TONE: Record<AssetCondition, string> = {
  New: 'bg-success-bg text-success',
  Good: 'bg-success-bg text-success',
  Fair: 'bg-warning-bg text-warning',
  Damaged: 'bg-warning-bg text-warning',
  Lost: 'bg-danger-bg text-danger',
}

export function AssetsTable({
  assets,
  employees,
  canEdit,
}: {
  assets: Asset[]
  employees: EmployeeRef[]
  canEdit: boolean
}) {
  const empById = new Map(employees.map((e) => [e.id, e]))
  const [filterType, setFilterType] = useState<AssetType | ''>('')
  const [filterAssigned, setFilterAssigned] = useState<'all' | 'assigned' | 'unassigned' | 'returned'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  function notify(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(null), 8000)
  }

  const filtered = assets.filter((a) => {
    if (filterType && a.type !== filterType) return false
    if (filterAssigned === 'assigned' && !a.assignedTo) return false
    if (filterAssigned === 'unassigned' && (a.assignedTo || a.returnedAt)) return false
    if (filterAssigned === 'returned' && !a.returnedAt) return false
    return true
  })

  return (
    <div className="rounded-lg border border-line bg-card">
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Type</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType((e.target.value as AssetType | '') || '')}
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Status</label>
          <select
            value={filterAssigned}
            onChange={(e) =>
              setFilterAssigned(e.target.value as 'all' | 'assigned' | 'unassigned' | 'returned')
            }
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
            <option value="returned">Returned</option>
          </select>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="ml-auto inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark"
          >
            {showCreate ? 'Close' : '+ Add asset'}
          </button>
        )}
      </div>
      {showCreate && canEdit && (
        <CreateAssetForm onClose={() => setShowCreate(false)} notify={notify} />
      )}
      {status && (
        <p role="status" aria-live="polite" className="border-b border-line px-4 py-2 text-xs text-ink-2">
          {status}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
              <th className="px-5 py-2">Type</th>
              <th className="px-3 py-2">Identifier</th>
              <th className="px-3 py-2">Assigned to</th>
              <th className="px-3 py-2">Condition</th>
              <th className="px-3 py-2">Notes</th>
              {canEdit && <th className="px-5 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <Row key={a.id} asset={a} empById={empById} employees={employees} canEdit={canEdit} notify={notify} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-5 py-6 text-sm text-ink-3 text-center">
                  No assets match the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({
  asset,
  empById,
  employees,
  canEdit,
  notify,
}: {
  asset: Asset
  empById: Map<string, EmployeeRef>
  employees: EmployeeRef[]
  canEdit: boolean
  notify: (msg: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [assignTo, setAssignTo] = useState(asset.assignedTo ?? '')
  const [condition, setCondition] = useState<AssetCondition>(asset.condition)
  const [notes, setNotes] = useState(asset.notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const assignee = asset.assignedTo ? empById.get(asset.assignedTo) : null

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { id: asset.id, condition, notes }
      if (assignTo !== (asset.assignedTo ?? '')) {
        body.assignedTo = assignTo || null
      }
      const res = await fetch('/api/admin/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Save failed: ${res.status}`)
      notify(data.note ?? 'Saved.')
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function recordReturn() {
    if (!confirm('Mark this asset as returned?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: asset.id, returnAction: true }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Return failed: ${res.status}`)
      notify(data.note ?? 'Returned.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Return failed.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete asset ${asset.identifier}?`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/assets?id=${encodeURIComponent(asset.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Delete failed: ${res.status}`)
      }
      notify('Deleted.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-b border-line/50 align-top">
      <td className="px-5 py-3 font-medium text-ink">{asset.type}</td>
      <td className="px-3 py-3 tabular text-ink-2">{asset.identifier}</td>
      <td className="px-3 py-3 text-sm">
        {editing && canEdit ? (
          <select
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
          >
            <option value="">— unassigned —</option>
            {employees
              .filter((e) => e.status !== 'Exited')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.code})
                </option>
              ))}
          </select>
        ) : assignee ? (
          <span>
            <span className="font-medium text-ink">{assignee.name}</span>
            <span className="ml-2 text-xs text-ink-3 tabular">{assignee.code}</span>
          </span>
        ) : asset.returnedAt ? (
          <span className="text-ink-3 text-xs">Returned {asset.returnedAt.slice(0, 10)}</span>
        ) : (
          <span className="text-ink-3 text-xs">Unassigned</span>
        )}
      </td>
      <td className="px-3 py-3">
        {editing && canEdit ? (
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as AssetCondition)}
            className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
          >
            {ASSET_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${CONDITION_TONE[asset.condition]}`}>
            {asset.condition}
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-xs text-ink-3 max-w-[200px]">
        {editing && canEdit ? (
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1 text-xs"
          />
        ) : (
          asset.notes || ''
        )}
      </td>
      {canEdit && (
        <td className="px-5 py-3 text-right">
          <div className="flex flex-col items-end gap-1">
            {editing ? (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={save}
                  disabled={busy}
                  className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false)
                    setAssignTo(asset.assignedTo ?? '')
                    setCondition(asset.condition)
                    setNotes(asset.notes)
                    setError(null)
                  }}
                  disabled={busy}
                  className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-4 py-2 text-sm text-ink-2 hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1 justify-end">
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
                >
                  Edit
                </button>
                {asset.assignedTo && !asset.returnedAt && (
                  <button
                    onClick={recordReturn}
                    className="inline-flex min-h-[44px] items-center rounded bg-success px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Return
                  </button>
                )}
                <button
                  onClick={remove}
                  className="inline-flex min-h-[44px] items-center rounded border border-danger px-4 py-2 text-sm text-danger hover:bg-danger-bg"
                >
                  Delete
                </button>
              </div>
            )}
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        </td>
      )}
    </tr>
  )
}

function CreateAssetForm({
  onClose,
  notify,
}: {
  onClose: () => void
  notify: (msg: string) => void
}) {
  const [type, setType] = useState<AssetType>('Laptop')
  const [identifier, setIdentifier] = useState('')
  const [condition, setCondition] = useState<AssetCondition>('New')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, identifier, condition, notes }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Create failed: ${res.status}`)
      }
      notify('Asset added. Reflects once Vercel rebuilds (~2 minutes).')
      onClose()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-line bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AssetType)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Identifier</label>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="serial number / phone / email"
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as AssetCondition)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            {ASSET_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4">
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={submit}
          disabled={busy || !identifier.trim()}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Add asset'}
        </button>
        <button
          onClick={onClose}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm text-ink-2 hover:bg-surface"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  )
}
