'use client'

import { useEffect } from 'react'

interface Props {
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'warning' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Generic confirm dialog used for the rare pipeline transitions that
 * deserve a hard stop: Move backwards, Move to Joined, and any case where
 * the optimistic toast wouldn't be enough. Reject has its own modal because
 * it needs structured reason capture. */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const confirmClass =
    variant === 'danger'
      ? 'inline-flex min-h-[36px] items-center rounded bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60'
      : variant === 'warning'
        ? 'inline-flex min-h-[36px] items-center rounded bg-warning px-3 py-1.5 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-60'
        : 'inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-confirm-heading"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-2 sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-line bg-card p-5 shadow-lg sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="stage-confirm-heading" className="font-display text-lg text-ink">
          {title}
        </h2>
        {body && <p className="mt-2 text-sm text-ink-2">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface"
          >
            {cancelLabel}
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={confirmClass}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
