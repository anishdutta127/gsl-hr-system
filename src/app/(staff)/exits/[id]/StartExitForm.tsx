'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EXIT_TYPES, type ExitType } from '@/lib/types'

const INPUT =
  'mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal'

export function StartExitForm({
  employeeId,
  employeeName,
}: {
  employeeId: string
  employeeName: string
}) {
  const router = useRouter()
  const [exitType, setExitType] = useState<ExitType>('Voluntary')
  const [reason, setReason] = useState('')
  const [resignationDate, setResignationDate] = useState('')
  const [terminationDate, setTerminationDate] = useState('')
  const [lastWorkingDay, setLastWorkingDay] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTermination = exitType === 'Termination'

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!reason.trim()) return setError('Reason for leaving is required.')
    if (!lastWorkingDay) return setError('Last working day is required.')
    if (isTermination && !terminationDate) return setError('Termination date is required.')
    if (
      !window.confirm(
        `Start the exit for ${employeeName}? This records the last working day and creates the exit checklist.`,
      )
    )
      return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/exits/${employeeId}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exitType,
          reasonForLeaving: reason.trim(),
          resignationDate: isTermination ? null : resignationDate || null,
          terminationDate: isTermination ? terminationDate : null,
          lastWorkingDay,
          notes: notes.trim(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? 'Could not start the exit.')
        setBusy(false)
        return
      }
      router.refresh()
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="max-w-xl space-y-4 rounded-lg border border-line bg-card p-6"
      aria-label="Start exit"
    >
      <div>
        <h2 className="font-display text-lg text-ink">Start exit</h2>
        <p className="mt-1 text-sm text-ink-2">
          Capture the reason and the official last working day. The six-step exit checklist
          generates from this.
        </p>
      </div>

      <div>
        <label htmlFor="exit-type" className="block text-sm font-medium text-ink">
          Exit type
        </label>
        <select
          id="exit-type"
          value={exitType}
          onChange={(e) => setExitType(e.target.value as ExitType)}
          className={INPUT}
        >
          {EXIT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-ink">
          Reason for leaving *
        </label>
        <input
          id="reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g., Better opportunity, relocation, performance"
          className={INPUT}
        />
      </div>

      {isTermination ? (
        <div>
          <label htmlFor="termination-date" className="block text-sm font-medium text-ink">
            Termination date *
          </label>
          <input
            id="termination-date"
            type="date"
            value={terminationDate}
            onChange={(e) => setTerminationDate(e.target.value)}
            className={INPUT}
          />
        </div>
      ) : (
        <div>
          <label htmlFor="resignation-date" className="block text-sm font-medium text-ink">
            Resignation date
          </label>
          <input
            id="resignation-date"
            type="date"
            value={resignationDate}
            onChange={(e) => setResignationDate(e.target.value)}
            className={INPUT}
          />
        </div>
      )}

      <div>
        <label htmlFor="lwd" className="block text-sm font-medium text-ink">
          Last working day *
        </label>
        <input
          id="lwd"
          type="date"
          value={lastWorkingDay}
          onChange={(e) => setLastWorkingDay(e.target.value)}
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-ink">
          Notes
        </label>
        <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT} />
      </div>

      {error && (
        <div role="alert" className="rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-[44px] items-center justify-center rounded bg-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {busy ? 'Starting…' : 'Start exit'}
      </button>
    </form>
  )
}
