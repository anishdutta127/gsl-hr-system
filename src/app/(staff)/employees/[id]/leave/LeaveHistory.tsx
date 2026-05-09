'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LeaveApplication, LeaveStatus } from '@/lib/types'

const STATUS_TONE: Record<LeaveStatus, string> = {
  Draft: 'bg-surface text-ink-2',
  Submitted: 'bg-info-bg text-info',
  Approved: 'bg-success-bg text-success',
  Rejected: 'bg-danger-bg text-danger',
  Cancelled: 'bg-line text-ink-3',
  Recalled: 'bg-warning-bg text-warning',
}

export function LeaveHistory({
  applications,
  canActOn,
  canApprove,
  isOwnReport,
  currentUserId,
}: {
  applications: LeaveApplication[]
  canActOn: boolean
  canApprove: boolean
  isOwnReport: boolean
  currentUserId: string
}) {
  void isOwnReport
  void currentUserId
  if (applications.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-3">
        No leave applications on file.
      </div>
    )
  }
  const sorted = [...applications].sort((a, b) => b.startDate.localeCompare(a.startDate))
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
            <th className="px-5 py-2 w-[180px]">Window</th>
            <th className="px-3 py-2 w-[110px]">Type</th>
            <th className="px-3 py-2 text-right w-[80px]">Days</th>
            <th className="px-3 py-2 w-[120px]">Status</th>
            <th className="px-3 py-2">Reason / notes</th>
            <th className="px-5 py-2 text-right w-[200px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => (
            <Row
              key={a.id}
              app={a}
              canActOn={canActOn}
              canApprove={canApprove}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({
  app,
  canActOn,
  canApprove,
}: {
  app: LeaveApplication
  canActOn: boolean
  canApprove: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [recallReason, setRecallReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showRecall, setShowRecall] = useState(false)
  const router = useRouter()

  function notify(msg: string) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), 8000)
  }

  async function call(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/leave/${encodeURIComponent(app.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Action failed: ${res.status}`)
      notify(data.note ?? 'Saved.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-b border-line/50 align-top">
      <td className="px-5 py-3 tabular text-ink">
        {app.startDate}
        {app.startDate !== app.endDate && <> to {app.endDate}</>}
        {app.isHalfDay && (
          <span className="ml-1 text-xs text-ink-3">(half-day {app.halfDaySession})</span>
        )}
        {app.isEmergency && (
          <span className="ml-2 rounded-sm bg-warning-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-warning">
            Emergency
          </span>
        )}
      </td>
      <td className="px-3 py-3 capitalize text-ink-2">{app.leaveType}</td>
      <td className="px-3 py-3 text-right tabular text-ink">
        {app.totalDays}
        {app.lossOfPayDays > 0 && (
          <span className="ml-1 text-xs text-warning">(LOP {app.lossOfPayDays})</span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_TONE[app.status]}`}>
          {app.status}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-ink-2 max-w-[280px]">
        <div className="whitespace-pre-wrap">{app.reason}</div>
        {app.rejectionReason && (
          <p className="mt-1 text-danger">Rejected: {app.rejectionReason}</p>
        )}
        {app.recallReason && <p className="mt-1 text-warning">Recalled: {app.recallReason}</p>}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex flex-col items-end gap-2">
          {canApprove && app.status === 'Submitted' && (
            <div className="flex flex-wrap gap-1 justify-end">
              <button
                onClick={() => call({ action: 'approve' })}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center rounded bg-success px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setShowReject((v) => !v)}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center rounded border border-danger px-4 py-2 text-sm text-danger hover:bg-danger-bg disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )}
          {showReject && (
            <div className="flex w-[260px] flex-col gap-1">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder="Why rejected?"
                className="w-full rounded border border-line-strong bg-card px-2 py-1 text-xs"
                disabled={busy}
              />
              <button
                onClick={() => call({ action: 'reject', rejectionReason: rejectReason })}
                disabled={busy || !rejectReason.trim()}
                className="inline-flex min-h-[44px] items-center justify-center rounded bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Confirm reject
              </button>
            </div>
          )}
          {canActOn && app.status === 'Approved' && (
            <button
              onClick={() => setShowRecall((v) => !v)}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded border border-warning px-4 py-2 text-sm text-warning hover:bg-warning-bg disabled:opacity-50"
            >
              Recall
            </button>
          )}
          {showRecall && (
            <div className="flex w-[260px] flex-col gap-1">
              <textarea
                value={recallReason}
                onChange={(e) => setRecallReason(e.target.value)}
                rows={2}
                placeholder="Why recalled?"
                className="w-full rounded border border-line-strong bg-card px-2 py-1 text-xs"
                disabled={busy}
              />
              <button
                onClick={() => call({ action: 'recall', recallReason })}
                disabled={busy || !recallReason.trim()}
                className="inline-flex min-h-[44px] items-center justify-center rounded bg-warning px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Confirm recall
              </button>
            </div>
          )}
          {canActOn && (app.status === 'Submitted' || app.status === 'Draft') && (
            <button
              onClick={() => call({ action: 'cancel' })}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-4 py-2 text-sm text-ink-2 hover:bg-surface disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {error && <span className="text-xs text-danger">{error}</span>}
          {statusMsg && (
            <span role="status" aria-live="polite" className="text-xs text-ink-2">
              {statusMsg}
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}
