'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Holiday, HolidayType } from '@/lib/types'

type HolidayWithDay = Holiday & { dayOfWeek: string }

export function HolidayList({
  holidays,
  canEdit,
}: {
  holidays: HolidayWithDay[]
  canEdit: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  function notify(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(null), 8000)
  }
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
              <th className="px-5 py-2 w-[120px]">Date</th>
              <th className="px-3 py-2 w-[60px]">Day</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Notes</th>
              {canEdit && <th className="px-5 py-2 text-right w-[120px]">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {holidays.map((h) => (
              <HolidayRow key={h.id} h={h} canEdit={canEdit} notify={notify} />
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="border-t border-line px-5 py-3">
          {showCreate ? (
            <CreateHolidayForm
              defaultType={holidays[0]?.type ?? 'mandatory'}
              onClose={() => setShowCreate(false)}
              notify={notify}
            />
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
            >
              + Add holiday
            </button>
          )}
          {status && (
            <p role="status" aria-live="polite" className="mt-2 text-xs text-ink-2">
              {status}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function HolidayRow({
  h,
  canEdit,
  notify,
}: {
  h: HolidayWithDay
  canEdit: boolean
  notify: (msg: string) => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <tr className="border-b border-line/50">
      {editing ? (
        <EditHolidayCells h={h} onClose={() => setEditing(false)} notify={notify} />
      ) : (
        <>
          <td className="px-5 py-2 tabular text-ink">{h.date}</td>
          <td className="px-3 py-2 text-ink-2">{h.dayOfWeek}</td>
          <td className="px-3 py-2 font-medium text-ink">{h.name}</td>
          <td className="px-3 py-2 text-ink-3">{h.notes ?? ''}</td>
          {canEdit && (
            <td className="px-5 py-2 text-right">
              <button
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-navy hover:text-navy-dark"
              >
                Edit
              </button>
            </td>
          )}
        </>
      )}
    </tr>
  )
}

function EditHolidayCells({
  h,
  onClose,
  notify,
}: {
  h: HolidayWithDay
  onClose: () => void
  notify: (msg: string) => void
}) {
  const [date, setDate] = useState(h.date)
  const [name, setName] = useState(h.name)
  const [type, setType] = useState<HolidayType>(h.type)
  const [notes, setNotes] = useState(h.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await postJson('/api/admin/holidays', {
        method: 'PATCH',
        body: { id: h.id, date, name, type, notes: notes.trim() || null },
      })
      onClose()
      notify('Saved. The calendar updates everywhere once Vercel rebuilds (~2 minutes).')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete "${h.name}" (${h.date})?`)) return
    setBusy(true)
    setError(null)
    try {
      await postJson(`/api/admin/holidays?id=${encodeURIComponent(h.id)}`, {
        method: 'DELETE',
      })
      notify('Deleted. The calendar updates everywhere once Vercel rebuilds (~2 minutes).')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <td className="px-5 py-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded border border-line-strong bg-card px-2 py-1 text-sm"
          disabled={busy}
        />
      </td>
      <td className="px-3 py-2 text-ink-3">{/* day auto-derived */}—</td>
      <td className="px-3 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-line-strong bg-card px-2 py-1 text-sm"
          disabled={busy}
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          className="w-full rounded border border-line-strong bg-card px-2 py-1 text-sm"
          disabled={busy}
        />
      </td>
      <td className="px-5 py-2 text-right">
        <div className="flex flex-col items-end gap-1">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as HolidayType)}
            className="rounded border border-line-strong bg-card px-2 py-1 text-xs"
            disabled={busy}
          >
            <option value="mandatory">Mandatory</option>
            <option value="optional">Optional</option>
          </select>
          <div className="flex gap-1">
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-navy px-2 py-1 text-xs font-medium text-white hover:bg-navy-dark disabled:opacity-50"
            >
              {busy ? '...' : 'Save'}
            </button>
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded border border-line-strong px-2 py-1 text-xs text-ink-2 hover:bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-bg"
            >
              Delete
            </button>
          </div>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      </td>
    </>
  )
}

function CreateHolidayForm({
  defaultType,
  onClose,
  notify,
}: {
  defaultType: HolidayType
  onClose: () => void
  notify: (msg: string) => void
}) {
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<HolidayType>(defaultType)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await postJson('/api/admin/holidays', {
        method: 'POST',
        body: { date, name, type, notes: notes.trim() || undefined },
      })
      onClose()
      notify('Added. The new holiday appears once Vercel rebuilds (~2 minutes).')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded border border-line-strong bg-card px-2 py-1 text-sm"
          disabled={busy}
        />
      </div>
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1 text-sm"
          disabled={busy}
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as HolidayType)}
          className="mt-1 rounded border border-line-strong bg-card px-2 py-1 text-sm"
          disabled={busy}
        >
          <option value="mandatory">Mandatory</option>
          <option value="optional">Optional</option>
        </select>
      </div>
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Notes</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1 text-sm"
          disabled={busy}
        />
      </div>
      <div className="flex gap-1">
        <button
          onClick={submit}
          disabled={busy || !date || !name}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Add'}
        </button>
        <button
          onClick={onClose}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-4 py-2 text-sm text-ink-2 hover:bg-surface"
        >
          Cancel
        </button>
      </div>
      {error && <span className="w-full text-xs text-danger">{error}</span>}
    </div>
  )
}

async function postJson(
  url: string,
  init: { method: 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<void> {
  const res = await fetch(url, {
    method: init.method,
    headers: { 'Content-Type': 'application/json' },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(data.message ?? `Request failed: ${res.status}`)
  }
}
