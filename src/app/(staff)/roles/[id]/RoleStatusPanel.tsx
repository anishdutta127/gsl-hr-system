'use client'

/*
 * Combined status pill + lifecycle actions for a single role.
 *
 * Owns optimistic status: clicking Pause/Close/Resume/Publish flips the pill
 * within 100ms, the queue write happens in the background, and a toast confirms
 * "Will reflect everywhere within ~1 minute." On failure the pill reverts and
 * a red toast surfaces the reason.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CLOSE_OUTCOMES,
  availableActions,
  nextStatusFor,
  type ActionDescriptor,
  type CloseOutcome,
  type LifecycleAction,
} from '@/lib/roleStatus'
import type { Role } from '@/lib/types'
import { RoleStatusPill } from '@/components/RoleStatusPill'
import { useOptimisticAction } from '@/lib/hooks/useOptimisticAction'

interface OptimisticState {
  status: Role['status']
  pauseReason: string | null
  closeOutcome: Role['closeOutcome'] | null
  closeNotes: string | null
}

export function RoleStatusPanel({
  role,
  activeCandidates,
  activeOffers,
  canManageStatus,
}: {
  role: Pick<
    Role,
    'id' | 'status' | 'pauseReason' | 'closeOutcome' | 'closeNotes' | 'description'
  >
  activeCandidates: number
  activeOffers: number
  canManageStatus: boolean
}) {
  const router = useRouter()
  const initial: OptimisticState = {
    status: role.status,
    pauseReason: role.pauseReason ?? null,
    closeOutcome: role.closeOutcome ?? null,
    closeNotes: role.closeNotes ?? null,
  }

  const action = useOptimisticAction<OptimisticState>(initial)
  const [openModal, setOpenModal] = useState<ActionDescriptor | null>(null)
  const [reason, setReason] = useState('')
  const [outcome, setOutcome] = useState<CloseOutcome | ''>('')
  const [notes, setNotes] = useState('')
  const [successToast, setSuccessToast] = useState<string | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)

  const lifecycleActions = canManageStatus ? availableActions({ status: action.current.status }) : []

  function startAction(desc: ActionDescriptor) {
    setReason('')
    setOutcome('')
    setNotes('')
    if (desc.needsReason || desc.needsOutcome) {
      setOpenModal(desc)
    } else {
      void runAction(desc)
    }
  }

  async function runAction(desc: ActionDescriptor) {
    const nextStatus = nextStatusFor(desc.action)
    const optimistic: OptimisticState = {
      status: nextStatus,
      pauseReason:
        desc.action === 'pause' ? (reason.trim() || null) : desc.action === 'resume' || desc.action === 'reopen' ? null : action.current.pauseReason,
      closeOutcome:
        desc.action === 'close' ? (outcome || null) : desc.action === 'reopen' ? null : action.current.closeOutcome,
      closeNotes:
        desc.action === 'close' ? (notes.trim() || null) : desc.action === 'reopen' ? null : action.current.closeNotes,
    }

    const res = await action.run({
      optimistic,
      perform: async () => {
        const r = await fetch(`/api/roles/${role.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: desc.action, reason, outcome, notes }),
        })
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { message?: string }
          throw new Error(b.message ?? 'Could not update status.')
        }
        return r.json()
      },
    })

    if (res.ok) {
      setOpenModal(null)
      setSuccessToast('Status updated. Will reflect everywhere within ~1 minute.')
      setTimeout(() => setSuccessToast(null), 4000)
      router.refresh()
    } else {
      setErrorToast(`Could not ${desc.label.toLowerCase()}: ${res.message}`)
    }
  }

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <RoleStatusPill status={action.current.status} />
        {action.busy && (
          <span className="text-xs text-ink-3" aria-live="polite">
            saving…
          </span>
        )}
      </div>

      {action.current.status === 'Paused' && action.current.pauseReason && (
        <p className="mt-1 text-xs text-ink-3">Paused: {action.current.pauseReason}</p>
      )}
      {action.current.status === 'Closed' && action.current.closeOutcome && (
        <p className="mt-1 text-xs text-ink-3">
          Closed: {action.current.closeOutcome}
          {action.current.closeNotes ? ` · ${action.current.closeNotes}` : ''}
        </p>
      )}

      {lifecycleActions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {lifecycleActions.map((desc) => (
            <button
              key={desc.action}
              type="button"
              onClick={() => startAction(desc)}
              disabled={action.busy}
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
      )}

      {openModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-status-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !action.busy && setOpenModal(null)}
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

            {action.error && (
              <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
                {action.error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                disabled={action.busy}
                className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runAction(openModal)}
                disabled={action.busy || (openModal.needsOutcome && !outcome)}
                className={
                  openModal.destructive
                    ? 'inline-flex min-h-[36px] items-center rounded bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60'
                    : 'inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60'
                }
              >
                {action.busy ? 'Working…' : openModal.label}
              </button>
            </div>
          </div>
        </div>
      )}

      {successToast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 right-6 rounded bg-ink px-4 py-2 text-sm text-white shadow-lg"
        >
          {successToast}
        </div>
      )}
      {errorToast && (
        <div role="alert" className="fixed bottom-6 right-6 rounded bg-danger px-4 py-2 text-sm text-white shadow-lg">
          <span>{errorToast}</span>
          <button
            onClick={() => setErrorToast(null)}
            className="ml-3 underline"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  )
}
