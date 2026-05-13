'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProbationStatus } from '@/lib/probation'

const KIND_TONE: Record<ProbationStatus['kind'], string> = {
  confirmed: 'bg-success-bg text-success',
  probation: 'bg-orange-light text-orange-dark',
  'pending-review': 'bg-danger-bg text-danger',
  na: 'bg-surface text-ink-3',
}

export function ProbationCard({
  employeeId,
  status,
  canEdit,
}: {
  employeeId: string
  status: ProbationStatus
  canEdit: boolean
}) {
  const [mode, setMode] = useState<'idle' | 'extend'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [extendDate, setExtendDate] = useState(status.endsAt ?? '')
  const [reason, setReason] = useState('')
  const router = useRouter()

  function notify(msg: string) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), 12000)
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const res = await fetch(`/api/employees/${employeeId}/probation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) {
        throw new Error(data.message ?? `Confirm failed: ${res.status}`)
      }
      notify(
        data.note ??
          'Confirmation queued. Click Sync now (top right) to force immediate sync, or wait for the next auto-sync.',
      )
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed.')
    } finally {
      setBusy(false)
    }
  }

  async function submitExtend() {
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const res = await fetch(`/api/employees/${employeeId}/probation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extend', newEndDate: extendDate, reason }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) {
        throw new Error(data.message ?? `Extend failed: ${res.status}`)
      }
      setMode('idle')
      notify(
        data.note ??
          'Extension queued. Click Sync now (top right) to force immediate sync, or wait for the next auto-sync.',
      )
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extend failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <h2 className="font-display text-lg text-ink">Probation</h2>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${KIND_TONE[status.kind]}`}>
          {labelFor(status)}
        </span>
        {status.endsAt && (
          <span className="text-xs text-ink-3 tabular">
            Ends {status.endsAt}
            {status.daysRemaining != null &&
              status.daysRemaining > 0 &&
              ` · ${status.daysRemaining} days remaining`}
          </span>
        )}
      </div>

      {canEdit && status.kind !== 'na' && status.kind !== 'confirmed' && (
        <div className="mt-4">
          {mode === 'idle' ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={confirm}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center rounded bg-success px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Confirm probation
              </button>
              <button
                onClick={() => setMode('extend')}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-4 py-2 text-sm text-ink hover:bg-surface"
              >
                Extend
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">
                  New end date
                </label>
                <input
                  type="date"
                  value={extendDate}
                  onChange={(e) => setExtendDate(e.target.value)}
                  className="mt-1 rounded border border-line-strong bg-card px-2 py-1 text-sm"
                  disabled={busy}
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">
                  Reason
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why are we extending probation?"
                  rows={2}
                  className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1 text-sm"
                  disabled={busy}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={submitExtend}
                  disabled={busy || !extendDate || !reason.trim()}
                  className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Save extension'}
                </button>
                <button
                  onClick={() => {
                    setMode('idle')
                    setError(null)
                  }}
                  disabled={busy}
                  className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-4 py-2 text-sm text-ink-2 hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      )}
      {statusMsg && (
        <p role="status" aria-live="polite" className="mt-3 text-xs text-ink-2">
          {statusMsg}
        </p>
      )}
    </div>
  )
}

function labelFor(status: ProbationStatus): string {
  switch (status.kind) {
    case 'confirmed':
      return 'Confirmed'
    case 'probation':
      return status.daysRemaining != null
        ? `Probation (${status.daysRemaining} days remaining)`
        : 'Probation'
    case 'pending-review':
      return 'Probation pending review'
    case 'na':
      return 'Probation N/A'
  }
}
