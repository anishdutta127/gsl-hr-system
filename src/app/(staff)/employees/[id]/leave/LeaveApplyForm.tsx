'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LEAVE_TYPES, type LeaveType, type WorkPattern } from '@/lib/types'

const TYPE_LABEL: Record<LeaveType, string> = {
  casual: 'Casual',
  sick: 'Sick',
  unpaid: 'Unpaid (Loss of Pay)',
  maternity: 'Maternity',
  paternity: 'Paternity',
  bereavement: 'Bereavement',
  compensatory: 'Compensatory',
}

export function LeaveApplyForm({
  employeeId,
  employeeName,
  workPattern,
  isHrOrAdmin,
}: {
  employeeId: string
  employeeName: string
  workPattern: WorkPattern
  isHrOrAdmin: boolean
}) {
  void workPattern
  const today = new Date().toISOString().slice(0, 10)
  const [leaveType, setLeaveType] = useState<LeaveType>('casual')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [isHalfDay, setIsHalfDay] = useState(false)
  const [halfDaySession, setHalfDaySession] = useState<'morning' | 'afternoon'>('morning')
  const [reason, setReason] = useState('')
  const [isEmergency, setIsEmergency] = useState(false)
  const [approveImmediately, setApproveImmediately] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [pendingLOP, setPendingLOP] = useState<{ days: number } | null>(null)
  const router = useRouter()

  async function submit(confirmLossOfPay = false) {
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const body = {
        employeeId,
        leaveType,
        startDate,
        endDate: isHalfDay ? startDate : endDate,
        reason,
        isHalfDay,
        halfDaySession: isHalfDay ? halfDaySession : undefined,
        isEmergency,
        approveImmediately: isHrOrAdmin && approveImmediately,
        confirmLossOfPay,
      }
      const res = await fetch('/api/admin/leave/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        note?: string
        requiresLOPConfirmation?: boolean
        lossOfPayDays?: number
      }
      if (!res.ok) {
        if (data.requiresLOPConfirmation && data.lossOfPayDays != null) {
          setPendingLOP({ days: data.lossOfPayDays })
          setBusy(false)
          return
        }
        throw new Error(data.message ?? `Apply failed: ${res.status}`)
      }
      setStatusMsg(data.note ?? 'Saved.')
      setTimeout(() => setStatusMsg(null), 12000)
      setReason('')
      setPendingLOP(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <p className="text-sm text-ink-2">
        Applying on behalf of <span className="font-medium text-ink">{employeeName}</span>.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Leave type">
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            disabled={busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={isHalfDay ? startDate : endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={busy || isHalfDay}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </Field>
        <Field label="Options">
          <div className="flex flex-col gap-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={isHalfDay}
                onChange={(e) => setIsHalfDay(e.target.checked)}
                disabled={busy}
                className="h-4 w-4 accent-orange"
              />
              Half-day
            </label>
            {isHalfDay && (
              <select
                value={halfDaySession}
                onChange={(e) => setHalfDaySession(e.target.value as 'morning' | 'afternoon')}
                disabled={busy}
                className="rounded border border-line-strong bg-card px-2 py-1 text-xs"
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
              </select>
            )}
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={isEmergency}
                onChange={(e) => setIsEmergency(e.target.checked)}
                disabled={busy}
                className="h-4 w-4 accent-orange"
              />
              Emergency / retroactive (up to 7 days back)
            </label>
            {isHrOrAdmin && (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={approveImmediately}
                  onChange={(e) => setApproveImmediately(e.target.checked)}
                  disabled={busy}
                  className="h-4 w-4 accent-orange"
                />
                Apply and approve in one step
              </label>
            )}
          </div>
        </Field>
        <Field label="Reason" full>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            disabled={busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            placeholder="Brief context for the leave"
          />
        </Field>
      </div>

      {pendingLOP && (
        <div role="alert" className="mt-3 rounded border border-warning bg-warning-bg p-3 text-sm text-ink">
          This leave will exceed the {leaveType} balance by{' '}
          <span className="font-medium">{pendingLOP.days}</span> day
          {pendingLOP.days === 1 ? '' : 's'}. The overflow will be logged as Loss of Pay.
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded bg-warning px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Confirm — apply with Loss of Pay
            </button>
            <button
              type="button"
              onClick={() => setPendingLOP(null)}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm text-ink-2 hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={busy || !reason.trim()}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Submit leave'}
        </button>
        {statusMsg && (
          <span role="status" aria-live="polite" className="text-xs text-ink-2">
            {statusMsg}
          </span>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
