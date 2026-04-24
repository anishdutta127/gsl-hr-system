'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Offer } from '@/lib/types'

export function OfferActions({ offer }: { offer: Offer }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(action: 'approve' | 'send' | 'accept' | 'decline' | 'withdraw', notes?: string) {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/offers/${offer.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes ?? '' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed.' }))
        setError(body.message ?? 'Failed.')
        setBusy(null)
        return
      }
      router.refresh()
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
    } finally {
      setBusy(null)
    }
  }

  const canApprove = offer.status === 'Draft'
  const canSend = offer.status === 'Approved'
  const canRespond = offer.status === 'Sent'
  const canWithdraw = offer.status === 'Draft' || offer.status === 'Approved' || offer.status === 'Sent'

  return (
    <aside className="rounded-lg border border-line bg-card p-5">
      <h2 className="font-display text-lg text-ink">Actions</h2>
      <p className="mt-1 text-xs text-ink-2">
        Current status: <span className="font-medium text-ink">{offer.status}</span>
      </p>
      {error && (
        <div
          role="alert"
          className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}
      <div className="mt-4 space-y-2">
        <ActionButton
          label="Approve"
          disabled={!canApprove || busy !== null}
          busy={busy === 'approve'}
          onClick={() => act('approve')}
          variant="primary"
        />
        <ActionButton
          label="Mark sent"
          disabled={!canSend || busy !== null}
          busy={busy === 'send'}
          onClick={() => act('send', 'Offer letter sent to candidate.')}
          variant="primary"
        />
        <ActionButton
          label="Mark accepted"
          disabled={!canRespond || busy !== null}
          busy={busy === 'accept'}
          onClick={() => act('accept')}
          variant="primary"
        />
        <ActionButton
          label="Mark declined"
          disabled={!canRespond || busy !== null}
          busy={busy === 'decline'}
          onClick={() => act('decline')}
          variant="secondary"
        />
        <ActionButton
          label="Withdraw offer"
          disabled={!canWithdraw || busy !== null}
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
