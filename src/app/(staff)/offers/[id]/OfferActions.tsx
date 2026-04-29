'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Offer } from '@/lib/types'
import { useOptimisticAction } from '@/lib/hooks/useOptimisticAction'

type Action = 'approve' | 'send' | 'accept' | 'decline' | 'withdraw'

const NEXT_STATUS: Record<Action, Offer['status']> = {
  approve: 'Approved',
  send: 'Sent',
  accept: 'Accepted',
  decline: 'Declined',
  withdraw: 'Withdrawn',
}

export function OfferActions({ offer }: { offer: Offer }) {
  const router = useRouter()
  const action = useOptimisticAction<Offer['status']>(offer.status)
  const [busy, setBusy] = useState<Action | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function act(a: Action, notes?: string) {
    setBusy(a)
    const res = await action.run({
      optimistic: NEXT_STATUS[a],
      perform: async () => {
        const r = await fetch(`/api/offers/${offer.id}/${a}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: notes ?? '' }),
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
      setSuccess('Offer updated. Will reflect everywhere within ~1 minute.')
      router.refresh()
      setTimeout(() => setSuccess(null), 4000)
    }
  }

  const status = action.current
  const canApprove = status === 'Draft'
  const canSend = status === 'Approved'
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
        <div role="status" aria-live="polite" className="mt-3 rounded border border-success bg-success-bg px-3 py-2 text-sm text-ink">
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
          onClick={() => act('send', 'Offer letter sent to candidate.')}
          variant="primary"
        />
        <ActionButton
          label="Mark accepted"
          disabled={!canRespond || action.busy}
          busy={busy === 'accept'}
          onClick={() => act('accept')}
          variant="primary"
        />
        <ActionButton
          label="Mark declined"
          disabled={!canRespond || action.busy}
          busy={busy === 'decline'}
          onClick={() => act('decline')}
          variant="secondary"
        />
        <ActionButton
          label="Withdraw offer"
          disabled={!canWithdraw || action.busy}
          busy={busy === 'withdraw'}
          onClick={() => act('withdraw')}
          variant="danger"
        />
      </div>
    </aside>
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
