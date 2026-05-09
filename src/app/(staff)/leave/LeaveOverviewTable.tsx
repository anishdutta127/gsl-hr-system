'use client'

import Link from 'next/link'
import type { LeaveStatus, LeaveType } from '@/lib/types'

interface Row {
  id: string
  employeeId: string
  employeeName: string
  employeeCode: string
  department: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  totalDays: number
  lossOfPayDays: number
  status: LeaveStatus
  reason: string
  isEmergency: boolean
}

const STATUS_TONE: Record<LeaveStatus, string> = {
  Draft: 'bg-surface text-ink-2',
  Submitted: 'bg-info-bg text-info',
  Approved: 'bg-success-bg text-success',
  Rejected: 'bg-danger-bg text-danger',
  Cancelled: 'bg-line text-ink-3',
  Recalled: 'bg-warning-bg text-warning',
}

export function LeaveOverviewTable({ rows }: { rows: Row[] }) {
  function exportCsv() {
    const header = [
      'Employee',
      'Code',
      'Department',
      'Type',
      'Start',
      'End',
      'Days',
      'LOP',
      'Status',
      'Reason',
      'Emergency',
    ]
    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push(
        [
          `"${r.employeeName}"`,
          r.employeeCode,
          `"${r.department}"`,
          r.leaveType,
          r.startDate,
          r.endDate,
          String(r.totalDays),
          String(r.lossOfPayDays),
          r.status,
          `"${r.reason.replace(/"/g, '""')}"`,
          r.isEmergency ? 'Yes' : '',
        ].join(','),
      )
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leave-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center text-sm text-ink-3">
        No applications match the current filter.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-card">
      <div className="flex items-center justify-end border-b border-line p-3">
        <button
          onClick={exportCsv}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
              <th className="px-5 py-2">Employee</th>
              <th className="px-3 py-2 w-[110px]">Type</th>
              <th className="px-3 py-2 w-[200px]">Window</th>
              <th className="px-3 py-2 text-right w-[70px]">Days</th>
              <th className="px-3 py-2 w-[120px]">Status</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-5 py-2 text-right w-[100px]">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/50 hover:bg-surface">
                <td className="px-5 py-2">
                  <div className="font-medium text-ink">{r.employeeName}</div>
                  <div className="text-xs text-ink-3 tabular">
                    {r.employeeCode} · {r.department}
                  </div>
                </td>
                <td className="px-3 py-2 capitalize text-ink-2">
                  {r.leaveType}
                  {r.isEmergency && (
                    <span className="ml-2 rounded-sm bg-warning-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-warning">
                      Emergency
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 tabular text-ink-2">
                  {r.startDate}
                  {r.startDate !== r.endDate && <> to {r.endDate}</>}
                </td>
                <td className="px-3 py-2 text-right tabular text-ink">
                  {r.totalDays}
                  {r.lossOfPayDays > 0 && (
                    <span className="ml-1 text-xs text-warning">(LOP {r.lossOfPayDays})</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_TONE[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-ink-2 max-w-[280px] truncate" title={r.reason}>
                  {r.reason}
                </td>
                <td className="px-5 py-2 text-right">
                  <Link
                    href={`/employees/${r.employeeId}/leave`}
                    className="text-xs font-medium text-navy hover:text-navy-dark"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
