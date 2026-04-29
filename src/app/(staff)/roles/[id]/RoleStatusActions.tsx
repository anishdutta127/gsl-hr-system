'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CLOSE_OUTCOMES,
  type ActionDescriptor,
  type CloseOutcome,
  type LifecycleAction,
} from '@/lib/roleStatus'

export function RoleStatusActions({
  roleId,
  actions,
  activeCandidates,
  activeOffers,
}: {
  roleId: string
  actions: ActionDescriptor[]
  activeCandidates: number
  activeOffers: number
}) {
  const router = useRouter()
  const [openModal, setOpenModal] = useState<ActionDescriptor | null>(null)
  const [reason, setReason] = useState('')
  const [outcome, setOutcome] = useState<CloseOutcome | ''>('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startAction(desc: ActionDescriptor) {
    setError(null)
    setReason('')
    setOutcome('')
    setNotes('')
    if (desc.needsReason || desc.needsOutcome) {
      setOpenModal(desc)
    } else {
      void submit(desc.action)
    }
  }

  async function submit(action: LifecycleAction) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/roles/${roleId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason, outcome, notes }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Failed.' }))
        setError(b.message ?? 'Failed.')
        setBusy(false)
        return
      }
      setOpenModal(null)
      router.refresh()
    } catch {
      setError("We couldn't reach our server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((desc) => (
          <button
            key={desc.action}
            type="button"
            onClick={() => startAction(desc)}
            disabled={busy}
            className={
              desc.destructive
                ? 'inline-flex min-h-[36px] items-center rounded border border-danger bg-danger-bg px-3 py-1.5 text-sm font-medium text-danger hover:opacity-90 disabled:opacity-60'
                : 'inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60'
            }
          >
            {desc.label}
          </button>
        ))}
      </div>

      {openModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-status-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setOpenModal(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-line bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="role-status-heading" className="font-display text-lg text-ink">
              {openModal.label} this role
            </h2>

            {openModal.needsReason && (
              <>
                <p className="mt-2 text-sm text-ink-2">
                  Optional. Captured on the audit trail so future you knows why this role is on hold.
                </p>
                <label htmlFor="pause-reason" className="mt-4 block text-xs font-medium text-ink-2">
                  Reason
                </label>
                <textarea
                  id="pause-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Awaiting budget approval; expected to resume in 4 weeks."
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                />
              </>
            )}

            {openModal.needsOutcome && (
              <>
                <p className="mt-2 text-sm text-ink-2">
                  Closing a role freezes the pipeline. Pick the outcome so reporting reflects what happened.
                </p>
                {(activeCandidates > 0 || activeOffers > 0) && (
                  <div
                    role="alert"
                    className="mt-3 rounded border border-warning bg-warning-bg px-3 py-2 text-sm text-ink"
                  >
                    Heads up: {activeCandidates > 0 && `${activeCandidates} candidate${activeCandidates === 1 ? '' : 's'} still in pipeline`}
                    {activeCandidates > 0 && activeOffers > 0 && ', '}
                    {activeOffers > 0 && `${activeOffers} offer${activeOffers === 1 ? '' : 's'} still open`}
                    . Closing freezes them in place.
                  </div>
                )}
                <label htmlFor="close-outcome" className="mt-4 block text-xs font-medium text-ink-2">
                  Outcome *
                </label>
                <select
                  id="close-outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as CloseOutcome | '')}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  <option value="">Select an outcome</option>
                  {CLOSE_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <label htmlFor="close-notes" className="mt-3 block text-xs font-medium text-ink-2">
                  Notes
                </label>
                <textarea
                  id="close-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Hired Priya Joshi (id …) on 2026-05-02."
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                />
              </>
            )}

            {error && (
              <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                disabled={busy}
                className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit(openModal.action)}
                disabled={busy || (openModal.needsOutcome && !outcome)}
                className={
                  openModal.destructive
                    ? 'inline-flex min-h-[36px] items-center rounded bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60'
                    : 'inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60'
                }
              >
                {busy ? 'Working…' : openModal.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
