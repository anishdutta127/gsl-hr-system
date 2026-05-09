'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LEAVE_FLOWS, type LeaveFlow } from '@/lib/types'

const LABEL: Record<LeaveFlow, string> = {
  'hr-mediated': 'HR-mediated (default)',
  'self-service': 'Self-service (employee submits, manager approves)',
}

const DESCRIPTION: Record<LeaveFlow, string> = {
  'hr-mediated':
    'HR opens a leave application on behalf of the employee. Today\'s default — Riddhi confirmed she needs more time before flipping self-service on.',
  'self-service':
    'Employees submit leave themselves; reporting managers approve or reject. Requires the employee portal + accounts to be live.',
}

export function LeaveFlowToggle({
  canEdit,
  initial,
  updatedAt,
  updatedBy,
}: {
  canEdit: boolean
  initial: LeaveFlow
  updatedAt: string
  updatedBy: string
}) {
  const [flow, setFlow] = useState<LeaveFlow>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const router = useRouter()

  async function save() {
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const res = await fetch('/api/admin/system-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaveFlow: flow }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Save failed: ${res.status}`)
      setStatusMsg(data.note ?? 'Saved.')
      setTimeout(() => setStatusMsg(null), 12000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-card p-5">
      <div className="space-y-3">
        {LEAVE_FLOWS.map((f) => (
          <label
            key={f}
            className={
              canEdit
                ? 'flex cursor-pointer items-start gap-3 rounded border border-line p-3 hover:bg-surface'
                : 'flex items-start gap-3 rounded border border-line p-3'
            }
          >
            <input
              type="radio"
              name="leave-flow"
              value={f}
              checked={flow === f}
              onChange={() => setFlow(f)}
              disabled={!canEdit || busy}
              className="mt-1 h-4 w-4 accent-orange"
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-ink">{LABEL[f]}</span>
              <span className="mt-1 block text-xs text-ink-3">{DESCRIPTION[f]}</span>
            </span>
          </label>
        ))}
      </div>
      {updatedAt && (
        <p className="mt-3 text-xs text-ink-3">
          Last changed {updatedAt.slice(0, 10)}
          {updatedBy ? ` by ${updatedBy}` : ''}.
        </p>
      )}
      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy || flow === initial}
            className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save leave flow'}
          </button>
          {statusMsg && (
            <span role="status" aria-live="polite" className="text-xs text-ink-2">
              {statusMsg}
            </span>
          )}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
    </section>
  )
}
