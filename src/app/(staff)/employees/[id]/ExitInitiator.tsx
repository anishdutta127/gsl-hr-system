'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ExitInitiator({ employeeId }: { employeeId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [lastWorkingDay, setLastWorkingDay] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!lastWorkingDay) {
      setError('Last working day is required.')
      return
    }
    if (!reason.trim()) {
      setError('Reason is required.')
      return
    }
    if (!window.confirm('Initiate exit for this employee? This records the last working day and moves them to Exited.')) {
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastWorkingDay,
          reason: reason.trim(),
          notes: notes.trim(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed.' }))
        setError(body.message ?? 'Failed.')
        setBusy(false)
        return
      }
      router.refresh()
      setOpen(false)
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Exit</h2>
        <p className="mt-2 text-sm text-ink-2">
          Record last working day and issue relieving / experience letters.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface"
        >
          Initiate exit
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-line bg-card p-5"
      aria-label="Initiate exit"
    >
      <h2 className="font-display text-lg text-ink">Initiate exit</h2>
      <div>
        <label htmlFor="lwd" className="block text-sm font-medium text-ink">
          Last working day *
        </label>
        <input
          id="lwd"
          type="date"
          value={lastWorkingDay}
          onChange={(e) => setLastWorkingDay(e.target.value)}
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>
      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-ink">
          Reason *
        </label>
        <input
          id="reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g., Resignation"
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-ink">
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>
      {error && (
        <div role="alert" className="rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Confirm exit'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
