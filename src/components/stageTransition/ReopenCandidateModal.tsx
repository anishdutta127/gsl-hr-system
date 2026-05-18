'use client'

import { useEffect, useId, useState } from 'react'

const MIN_REASON_LENGTH = 10

export interface ReopenModalProps {
  open: boolean
  /** "Muzammil Khan" for single, "3 candidates" for bulk. */
  subjectLabel: string
  /** Non-terminal stages the modal can pick from. For bulk, the
   * intersection of allowed stages across selected applications' roles. */
  targetStageOptions: string[]
  /** Source terminal stage(s), for the explanatory copy. Single string for
   * single, comma-separated summary for bulk (eg "Rejected (2), Withdrawn"). */
  fromLabel: string
  busy: boolean
  onCancel: () => void
  onSubmit: (payload: { targetStage: string; reason: string; notifyCandidate: boolean }) => void
}

/**
 * Reason-captured "Reopen candidate" modal. Used by:
 *   - the candidate detail page (single application reopen)
 *   - the role Kanban card menu (single application reopen)
 *   - the bulk action bar (bulk reopen - one reason applied to all)
 *
 * Drag-drop OUT of a terminal column does NOT route through this modal -
 * accidental drags should never reopen a candidate. Reopen is always
 * explicit, with a recorded reason.
 */
export function ReopenCandidateModal({
  open,
  subjectLabel,
  targetStageOptions,
  fromLabel,
  busy,
  onCancel,
  onSubmit,
}: ReopenModalProps) {
  const titleId = useId()
  const reasonId = useId()
  const stageId = useId()
  const notifyId = useId()
  const [reason, setReason] = useState('')
  const [targetStage, setTargetStage] = useState(targetStageOptions[0] ?? '')
  const [notifyCandidate, setNotifyCandidate] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) {
      setReason('')
      setTargetStage(targetStageOptions[0] ?? '')
      setNotifyCandidate(false)
      setSubmitted(false)
      return
    }
    setTargetStage((prev) =>
      prev && targetStageOptions.includes(prev) ? prev : targetStageOptions[0] ?? '',
    )
  }, [open, targetStageOptions])

  if (!open) return null

  const reasonTrimmed = reason.trim()
  const reasonTooShort = reasonTrimmed.length < MIN_REASON_LENGTH
  const stageMissing = !targetStage
  const showReasonError = submitted && reasonTooShort
  const showStageError = submitted && stageMissing

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (reasonTooShort || stageMissing) return
    onSubmit({ targetStage, reason: reasonTrimmed, notifyCandidate })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-line bg-card p-6 shadow-lg"
      >
        <h2 id={titleId} className="font-display text-lg text-ink">
          Reopen {subjectLabel}
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Currently {fromLabel}. Reopening records an audit entry and moves the candidate to the
          stage you pick.
        </p>

        <label htmlFor={reasonId} className="mt-4 block text-xs font-medium text-ink-2">
          Why is this candidate being reopened?
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          aria-required="true"
          aria-invalid={showReasonError}
          placeholder="Background-check delay resolved. Confirmed availability for joining."
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-ink-3">
          <span>
            {reasonTrimmed.length}/{MIN_REASON_LENGTH}+ characters required
          </span>
          {showReasonError && (
            <span role="alert" className="text-danger">
              Please write at least {MIN_REASON_LENGTH} characters.
            </span>
          )}
        </div>

        <label htmlFor={stageId} className="mt-4 block text-xs font-medium text-ink-2">
          Move to stage
        </label>
        <select
          id={stageId}
          value={targetStage}
          onChange={(e) => setTargetStage(e.target.value)}
          aria-required="true"
          aria-invalid={showStageError}
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          {targetStageOptions.length === 0 && <option value="">No eligible stages</option>}
          {targetStageOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {showStageError && (
          <p role="alert" className="mt-1 text-xs text-danger">
            Pick a target stage.
          </p>
        )}

        <label
          htmlFor={notifyId}
          className="mt-4 flex items-start gap-2 text-sm text-ink-2"
        >
          <input
            id={notifyId}
            type="checkbox"
            checked={notifyCandidate}
            onChange={(e) => setNotifyCandidate(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
          />
          <span>
            Notify the candidate.
            <span className="ml-1 text-xs text-ink-3">
              Adds a follow-up reminder; HR drafts the actual message from the candidate page.
            </span>
          </span>
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || targetStageOptions.length === 0}
            className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
          >
            {busy ? 'Reopening…' : 'Reopen candidate'}
          </button>
        </div>
      </form>
    </div>
  )
}
