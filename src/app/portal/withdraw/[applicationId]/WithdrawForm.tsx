'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const REASONS = [
  'Accepted another offer',
  'Role no longer a fit',
  'Need to pause job search',
  'Compensation expectations differ',
  'Prefer not to say',
]

export function WithdrawForm({ applicationId }: { applicationId: string }) {
  const router = useRouter()
  const [reason, setReason] = useState<string>(REASONS[4] ?? 'Prefer not to say')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/portal/withdraw/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes: notes.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Could not save.' }))
        setError(body.message ?? 'Could not save.')
        setBusy(false)
        return
      }
      router.push('/portal/me')
      router.refresh()
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-line bg-card p-6">
      <label htmlFor="reason" className="block text-sm font-medium text-ink">
        Reason (optional)
      </label>
      <select
        id="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        {REASONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <label htmlFor="notes" className="mt-4 block text-sm font-medium text-ink">
        Notes (optional)
      </label>
      <textarea
        id="notes"
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />

      {error && (
        <div
          role="alert"
          className="mt-4 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded bg-danger px-4 py-2.5 text-base font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy ? 'Withdrawing…' : 'Withdraw application'}
        </button>
        <button
          type="button"
          onClick={() => (window.location.href = '/portal/me')}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2.5 text-base font-medium text-ink hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
