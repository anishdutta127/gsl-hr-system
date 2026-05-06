'use client'

import { useEffect, useState } from 'react'
import { REJECTION_REASONS, type RejectionReason } from '@/lib/stageTransition'

interface Props {
  open: boolean
  /** Display name (single candidate or "X candidates"). */
  subjectLabel: string
  /** True when the modal is collecting a reason for a bulk reject. */
  bulk?: boolean
  busy?: boolean
  onCancel: () => void
  onSubmit: (payload: { rejectionReason: RejectionReason; rejectionNotes?: string }) => void
}

export function RejectReasonModal({
  open,
  subjectLabel,
  bulk = false,
  busy = false,
  onCancel,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState<RejectionReason | ''>('')
  const [notes, setNotes] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) {
      setReason('')
      setNotes('')
      setTouched(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const reasonMissing = !reason
  const otherWithoutNotes = reason === 'Other' && !notes.trim()
  const blocked = reasonMissing || otherWithoutNotes

  function handleSubmit() {
    setTouched(true)
    if (blocked || !reason) return
    onSubmit({
      rejectionReason: reason,
      rejectionNotes: notes.trim() ? notes.trim() : undefined,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-reason-heading"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-2 sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-line bg-card p-5 shadow-lg sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reject-reason-heading" className="font-display text-lg text-ink">
          {bulk ? `Reject ${subjectLabel}?` : `Reject ${subjectLabel}?`}
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          {bulk
            ? 'A reason is recorded for each candidate. Used to analyse why we lose people.'
            : 'A reason is required and will be saved on the audit timeline.'}
        </p>

        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-ink-2">Reason</legend>
          <div className="mt-2 space-y-1.5">
            {REJECTION_REASONS.map((r) => (
              <label
                key={r}
                className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded border border-line px-3 py-1.5 text-sm hover:bg-surface"
              >
                <input
                  type="radio"
                  name="rejection-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="h-4 w-4 border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
                />
                <span className="text-ink">{r}</span>
              </label>
            ))}
          </div>
          {touched && reasonMissing && (
            <p role="alert" className="mt-2 text-xs text-danger">
              Pick a reason before saving.
            </p>
          )}
        </fieldset>

        <label htmlFor="reject-notes" className="mt-4 block text-xs font-medium text-ink-2">
          Notes {reason === 'Other' ? '(required)' : '(optional)'}
        </label>
        <textarea
          id="reject-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            reason === 'Other'
              ? 'Describe the reason for the audit log.'
              : 'Anything else to record.'
          }
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
        {touched && otherWithoutNotes && (
          <p role="alert" className="mt-2 text-xs text-danger">
            Notes are required when the reason is Other.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSubmit}
            className="inline-flex min-h-[36px] items-center rounded bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}
