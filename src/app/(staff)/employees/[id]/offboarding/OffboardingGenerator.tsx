'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function OffboardingGenerator({ employeeId }: { employeeId: string }) {
  const today = new Date().toISOString().slice(0, 10)
  const defaultLwd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [noticeStartDate, setNoticeStartDate] = useState(today)
  const [lastWorkingDay, setLastWorkingDay] = useState(defaultLwd)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const router = useRouter()

  async function generate() {
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const res = await fetch('/api/admin/offboarding/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, noticeStartDate, lastWorkingDay }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        note?: string
        generated?: number
      }
      if (!res.ok) throw new Error(data.message ?? `Generate failed: ${res.status}`)
      setStatusMsg(data.note ?? `${data.generated ?? 0} tasks generated.`)
      setTimeout(() => setStatusMsg(null), 12000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generate failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="text-left">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">
            Notice start
          </label>
          <input
            type="date"
            value={noticeStartDate}
            onChange={(e) => setNoticeStartDate(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">
            Last working day
          </label>
          <input
            type="date"
            value={lastWorkingDay}
            onChange={(e) => setLastWorkingDay(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <button
        onClick={generate}
        disabled={busy || lastWorkingDay <= noticeStartDate}
        className="mt-3 inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
      >
        {busy ? 'Generating...' : 'Generate offboarding tasks'}
      </button>
      {statusMsg && (
        <p role="status" aria-live="polite" className="mt-2 text-xs text-ink-2">
          {statusMsg}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
