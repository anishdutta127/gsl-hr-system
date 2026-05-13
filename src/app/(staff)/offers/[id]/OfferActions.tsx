'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Offer } from '@/lib/types'
import { OFFER_DECLINE_REASONS, type OfferDeclineReason } from '@/lib/stageTransition'
import { useOptimisticAction } from '@/lib/hooks/useOptimisticAction'

type Action = 'approve' | 'send' | 'resend' | 'accept' | 'decline' | 'withdraw'

const NEXT_STATUS: Record<Action, Offer['status']> = {
  approve: 'Approved',
  send: 'Sent',
  resend: 'Sent',
  accept: 'Accepted',
  decline: 'Declined',
  withdraw: 'Withdrawn',
}

const SYNC_HINT =
  'Click Sync now to force immediate sync, or wait for the next auto-sync.'

interface AcceptPayload {
  acceptedCtcAnnual?: number
  acceptedOn?: string
  acceptedJoiningDate?: string
  notes?: string
}

interface DeclinePayload {
  declineReason: OfferDeclineReason
  declineNotes?: string
}

export function OfferActions({ offer }: { offer: Offer }) {
  const router = useRouter()
  const action = useOptimisticAction<Offer['status']>(offer.status)
  const [busy, setBusy] = useState<Action | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [modal, setModal] = useState<null | 'accept' | 'decline' | 'withdraw' | 'resend'>(
    null,
  )

  async function act(a: Action, payload?: AcceptPayload | DeclinePayload | { notes?: string }) {
    setBusy(a)
    const res = await action.run({
      optimistic: NEXT_STATUS[a],
      perform: async () => {
        const r = await fetch(`/api/offers/${offer.id}/${a}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
        })
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { message?: string }
          throw new Error(b.message ?? 'Could not update offer.')
        }
        return r.json()
      },
    })
    setBusy(null)
    if (res.ok) {
      setSuccess(toastFor(a))
      router.refresh()
      setTimeout(() => setSuccess(null), 6000)
    }
  }

  const status = action.current
  const canApprove = status === 'Draft'
  const canSend = status === 'Approved'
  const canResend = status === 'Sent'
  const canRespond = status === 'Sent'
  const canWithdraw = status === 'Draft' || status === 'Approved' || status === 'Sent'

  return (
    <aside className="rounded-lg border border-line bg-card p-5">
      <h2 className="font-display text-lg text-ink">Actions</h2>
      <p className="mt-1 text-xs text-ink-2">
        Current status: <span className="font-medium text-ink">{status}</span>
        {action.busy && <span className="ml-2 text-ink-3">saving…</span>}
      </p>
      {action.error && (
        <div
          role="alert"
          className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {action.error}
        </div>
      )}
      {success && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded border border-success bg-success-bg px-3 py-2 text-sm text-ink"
        >
          {success}
        </div>
      )}
      <div className="mt-4 space-y-2">
        <ActionButton
          label="Approve"
          disabled={!canApprove || action.busy}
          busy={busy === 'approve'}
          onClick={() => act('approve')}
          variant="primary"
        />
        <ActionButton
          label="Mark sent"
          disabled={!canSend || action.busy}
          busy={busy === 'send'}
          onClick={() => act('send', { notes: 'Offer letter sent to candidate.' })}
          variant="primary"
        />
        <ActionButton
          label="Resend"
          disabled={!canResend || action.busy}
          busy={busy === 'resend'}
          onClick={() => setModal('resend')}
          variant="secondary"
        />
        <ActionButton
          label="Mark accepted…"
          disabled={!canRespond || action.busy}
          busy={busy === 'accept'}
          onClick={() => setModal('accept')}
          variant="primary"
        />
        <ActionButton
          label="Mark declined…"
          disabled={!canRespond || action.busy}
          busy={busy === 'decline'}
          onClick={() => setModal('decline')}
          variant="secondary"
        />
        <ActionButton
          label="Withdraw offer"
          disabled={!canWithdraw || action.busy}
          busy={busy === 'withdraw'}
          onClick={() => setModal('withdraw')}
          variant="danger"
        />
      </div>

      {offer.resentAt && offer.resentAt.length > 0 && (
        <p className="mt-4 text-xs text-ink-3">
          Resent {offer.resentAt.length} time{offer.resentAt.length === 1 ? '' : 's'}.
          Latest send: {new Date(offer.sentAt ?? '').toLocaleString('en-IN')}.
        </p>
      )}

      {modal === 'accept' && (
        <AcceptModal
          offer={offer}
          onCancel={() => setModal(null)}
          onConfirm={async (payload) => {
            setModal(null)
            await act('accept', payload)
          }}
        />
      )}
      {modal === 'decline' && (
        <DeclineModal
          onCancel={() => setModal(null)}
          onConfirm={async (payload) => {
            setModal(null)
            await act('decline', payload)
          }}
        />
      )}
      {modal === 'resend' && (
        <ConfirmModal
          title="Resend offer letter?"
          body="Marks the offer as Sent again. The audit log captures the resend; the candidate is not auto-emailed by this action - generate or share the letter separately."
          confirmLabel="Resend"
          variant="default"
          onCancel={() => setModal(null)}
          onConfirm={async () => {
            setModal(null)
            await act('resend')
          }}
        />
      )}
      {modal === 'withdraw' && (
        <ConfirmModal
          title="Withdraw this offer?"
          body="Withdraws the offer. The candidate's pipeline stage stays where it is so HR can decide what to do next. This cannot be undone through the UI."
          confirmLabel="Withdraw offer"
          variant="danger"
          onCancel={() => setModal(null)}
          onConfirm={async () => {
            setModal(null)
            await act('withdraw')
          }}
        />
      )}
    </aside>
  )
}

function toastFor(a: Action): string {
  if (a === 'accept') return `Offer marked accepted. ${SYNC_HINT}`
  if (a === 'decline') return `Offer marked declined. ${SYNC_HINT}`
  if (a === 'withdraw') return `Offer withdrawn. ${SYNC_HINT}`
  if (a === 'resend') return `Offer marked as resent. ${SYNC_HINT}`
  if (a === 'send') return `Offer marked as sent. ${SYNC_HINT}`
  if (a === 'approve') return `Offer approved. ${SYNC_HINT}`
  return `Offer updated. ${SYNC_HINT}`
}

function AcceptModal({
  offer,
  onCancel,
  onConfirm,
}: {
  offer: Offer
  onCancel: () => void
  onConfirm: (payload: AcceptPayload) => void | Promise<void>
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [acceptedOn, setAcceptedOn] = useState(today)
  const [acceptedCtcAnnual, setAcceptedCtcAnnual] = useState(
    String(offer.compensation.ctcAnnual),
  )
  const [acceptedJoiningDate, setAcceptedJoiningDate] = useState(
    offer.proposedJoiningDate ?? '',
  )
  const [notes, setNotes] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const ctc = Number(acceptedCtcAnnual)
    void onConfirm({
      acceptedCtcAnnual: Number.isFinite(ctc) && ctc > 0 ? ctc : undefined,
      acceptedOn: acceptedOn || undefined,
      acceptedJoiningDate: acceptedJoiningDate || undefined,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <ModalShell title="Mark offer accepted" onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <Field label="Acceptance date" htmlFor="acceptedOn">
          <input
            id="acceptedOn"
            type="date"
            value={acceptedOn}
            onChange={(e) => setAcceptedOn(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </Field>
        <Field label="Accepted annual CTC (Rs)" htmlFor="acceptedCtc" hint="Override only if HR negotiated.">
          <input
            id="acceptedCtc"
            type="number"
            min={1}
            step={1}
            value={acceptedCtcAnnual}
            onChange={(e) => setAcceptedCtcAnnual(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </Field>
        <Field label="Expected joining date" htmlFor="acceptedJoiningDate">
          <input
            id="acceptedJoiningDate"
            type="date"
            value={acceptedJoiningDate}
            onChange={(e) => setAcceptedJoiningDate(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </Field>
        <Field label="Notes" htmlFor="acceptNotes" hint="Optional - lands on the audit trail.">
          <textarea
            id="acceptNotes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </Field>
        <ModalActions
          confirmLabel="Mark accepted"
          variant="primary"
          onCancel={onCancel}
        />
      </form>
    </ModalShell>
  )
}

function DeclineModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: (payload: DeclinePayload) => void | Promise<void>
}) {
  const [declineReason, setDeclineReason] = useState<OfferDeclineReason | ''>('')
  const [declineNotes, setDeclineNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!declineReason) {
      setError('Pick a reason.')
      return
    }
    if (declineReason === 'Other' && !declineNotes.trim()) {
      setError('Notes are required when reason is Other.')
      return
    }
    setError(null)
    void onConfirm({
      declineReason,
      declineNotes: declineNotes.trim() || undefined,
    })
  }

  return (
    <ModalShell title="Mark offer declined" onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <Field label="Reason *" htmlFor="declineReason">
          <select
            id="declineReason"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value as OfferDeclineReason)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <option value="">Pick a reason</option>
            {OFFER_DECLINE_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={`Notes ${declineReason === 'Other' ? '*' : ''}`}
          htmlFor="declineNotes"
          hint={
            declineReason === 'Other'
              ? 'Required because reason is Other.'
              : 'Optional - context that helps source-effectiveness reporting.'
          }
        >
          <textarea
            id="declineNotes"
            rows={3}
            value={declineNotes}
            onChange={(e) => setDeclineNotes(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </Field>
        {error && (
          <div role="alert" className="rounded border border-danger bg-danger-bg px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        <ModalActions
          confirmLabel="Mark declined"
          variant="secondary"
          onCancel={onCancel}
        />
      </form>
    </ModalShell>
  )
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  variant,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  variant: 'default' | 'danger'
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  return (
    <ModalShell title={title} onCancel={onCancel}>
      <p className="text-sm text-ink-2">{body}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void onConfirm()}
          className={
            variant === 'danger'
              ? 'inline-flex min-h-[36px] items-center rounded bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90'
              : 'inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark'
          }
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  )
}

function ModalShell({
  title,
  onCancel,
  children,
}: {
  title: string
  onCancel: () => void
  children: React.ReactNode
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-line bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 font-display text-lg text-ink">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-3">{hint}</p>}
    </div>
  )
}

function ModalActions({
  confirmLabel,
  variant,
  onCancel,
}: {
  confirmLabel: string
  variant: 'primary' | 'secondary'
  onCancel: () => void
}) {
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface"
      >
        Cancel
      </button>
      <button
        type="submit"
        className={
          variant === 'primary'
            ? 'inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark'
            : 'inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface'
        }
      >
        {confirmLabel}
      </button>
    </div>
  )
}

function ActionButton({
  label,
  disabled,
  busy,
  onClick,
  variant,
}: {
  label: string
  disabled: boolean
  busy: boolean
  onClick: () => void
  variant: 'primary' | 'secondary' | 'danger'
}) {
  const classes =
    variant === 'primary'
      ? 'bg-navy text-white hover:bg-navy-dark'
      : variant === 'danger'
        ? 'bg-danger text-white hover:opacity-90'
        : 'border border-line-strong bg-card text-ink hover:bg-surface'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[44px] w-full items-center justify-center rounded px-4 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
    >
      {busy ? 'Working…' : label}
    </button>
  )
}
