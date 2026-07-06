'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'

/**
 * Confirmation dialog for closing (archiving) an exit. Lists any outstanding
 * steps and requires a short reason whenever work is incomplete. Shared by the
 * /exits board rows and the per-employee cockpit.
 *
 * Accessibility: role=dialog + aria-modal, focus moves to the reason field on
 * open, Tab/Shift+Tab are trapped within the dialog, Escape and the close (X)
 * button both dismiss, and focus is restored to the trigger on close.
 */
export function CloseExitDialog({
  employeeName,
  outstandingSteps,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  employeeName: string
  outstandingSteps: string[]
  busy: boolean
  error: string | null
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const titleId = useId()
  const reasonId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const hasOutstanding = outstandingSteps.length > 0
  const reasonRequired = hasOutstanding
  const canConfirm = !busy && (!reasonRequired || reason.trim().length > 0)

  // Focus the reason field on open; restore focus to the trigger on close.
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    reasonRef.current?.focus()
    return () => {
      returnFocusRef.current?.focus?.()
    }
  }, [])

  // Escape to dismiss; trap Tab / Shift+Tab within the dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        onCancel()
        return
      }
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg border border-line bg-card p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-lg text-ink">
            Close exit for {employeeName}?
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close dialog"
            className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink-2 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-sm text-ink-2">
          Closing archives this exit to Alumni, off the active board. No letters are issued.
        </p>

        {hasOutstanding ? (
          <div className="mt-3 rounded border border-orange-light bg-orange-light/40 p-3">
            <p className="text-sm font-medium text-orange-dark">
              {outstandingSteps.length} step{outstandingSteps.length === 1 ? '' : 's'} still outstanding:
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
              {outstandingSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm text-success">All steps are complete or marked not applicable.</p>
        )}

        <div className="mt-4">
          <label htmlFor={reasonId} className="block text-sm font-medium text-ink">
            Reason{reasonRequired ? ' *' : ' (optional)'}
          </label>
          <textarea
            id={reasonId}
            ref={reasonRef}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required={reasonRequired}
            placeholder={
              reasonRequired
                ? 'e.g., Termination - relieving and experience letters not applicable'
                : 'Optional note recorded with the close'
            }
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>

        {error && (
          <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={!canConfirm}
            className="inline-flex min-h-[44px] items-center rounded bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy ? 'Closing…' : 'Close exit'}
          </button>
        </div>
      </div>
    </div>
  )
}
