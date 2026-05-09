'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  buildLeaveDateSet,
  daysInMonth,
  defaultHybridDays,
  expectedDayKind,
  holidayDateSet,
} from '@/lib/roster'
import {
  ATTENDANCE_EXCEPTION_TYPES,
  type AttendanceException,
  type AttendanceExceptionType,
  type Holiday,
  type LeaveType,
  type WorkPattern,
} from '@/lib/types'

interface CompactEmployee {
  id: string
  name: string
  code: string
  department: string
  location: string
  workPattern: WorkPattern
}
interface CompactPick {
  employeeId: string
  holidayId: string
  year: number
}
interface CompactLeave {
  employeeId: string
  startDate: string
  endDate: string
  status: string
  leaveType: LeaveType
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const TYPE_LABEL: Record<AttendanceExceptionType, string> = {
  late: 'Late',
  'half-day': 'Half-day',
  absent: 'Absent',
  'work-from-home': 'WFH',
  'on-field': 'Field',
  'holiday-worked': 'Worked holiday',
}

const TYPE_TONE: Record<AttendanceExceptionType, string> = {
  late: 'bg-warning text-white',
  'half-day': 'bg-warning text-white',
  absent: 'bg-danger text-white',
  'work-from-home': 'bg-info text-white',
  'on-field': 'bg-info text-white',
  'holiday-worked': 'bg-success text-white',
}

export function AttendanceCalendar({
  employees,
  holidays,
  picks,
  approvedLeaves,
  exceptions,
  year,
  month,
  departments,
  departmentFilter,
  canEdit,
}: {
  employees: CompactEmployee[]
  holidays: Holiday[]
  picks: CompactPick[]
  approvedLeaves: CompactLeave[]
  exceptions: AttendanceException[]
  year: number
  month: number
  departments: string[]
  departmentFilter: string
  canEdit: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [selectedCell, setSelectedCell] = useState<{ empId: string; date: string } | null>(null)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkDate, setBulkDate] = useState<string | null>(null)
  const [bulkType, setBulkType] = useState<AttendanceExceptionType>('on-field')
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function notify(msg: string) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), 8000)
  }

  function setQuery(next: Partial<{ year: number; month: number; department: string }>) {
    const params = new URLSearchParams()
    params.set('year', String(next.year ?? year))
    params.set('month', String(next.month ?? month))
    if ((next.department ?? departmentFilter)) {
      params.set('department', next.department ?? departmentFilter)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const days = useMemo(() => daysInMonth(year, month), [year, month])

  const picksByEmp = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const p of picks) {
      if (p.year !== year) continue
      if (!map.has(p.employeeId)) map.set(p.employeeId, new Set())
      map.get(p.employeeId)!.add(p.holidayId)
    }
    return map
  }, [picks, year])

  const exMap = useMemo(() => {
    const m = new Map<string, AttendanceException>()
    for (const ex of exceptions) {
      const key = `${ex.employeeId}|${ex.date}`
      const existing = m.get(key)
      if (!existing || ex.loggedAt > existing.loggedAt) m.set(key, ex)
    }
    return m
  }, [exceptions])

  const monthStart = days[0] ?? `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = days[days.length - 1] ?? monthStart

  const grids = employees.map((emp) => {
    const dates = holidayDateSet(holidays, picksByEmp.get(emp.id) ?? new Set())
    const empLeaves = approvedLeaves.filter((l) => l.employeeId === emp.id)
    const leaveDates = buildLeaveDateSet({
      approvedLeaves: empLeaves,
      windowStart: monthStart,
      windowEnd: monthEnd,
    })
    const cells = days.map((d) => {
      const baseKind = expectedDayKind({
        workPattern: emp.workPattern,
        dateIso: d,
        holidayDates: dates,
        hybridDays: defaultHybridDays(emp.department),
        leaveDates,
      })
      const ex = exMap.get(`${emp.id}|${d}`) ?? null
      return { date: d, baseKind, exception: ex }
    })
    return { emp, cells }
  })

  async function logException({
    empId,
    date,
    type,
    notes,
  }: {
    empId: string
    date: string
    type: AttendanceExceptionType
    notes: string
  }) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: empId, date, type, notes }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Failed: ${res.status}`)
      notify(data.note ?? 'Logged.')
      setSelectedCell(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteException(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/attendance?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Failed: ${res.status}`)
      }
      notify('Cleared.')
      setSelectedCell(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.')
    } finally {
      setBusy(false)
    }
  }

  async function bulkApply() {
    if (!bulkDate || bulkSelected.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeIds: [...bulkSelected],
          date: bulkDate,
          type: bulkType,
          notes: 'Bulk-marked',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Failed: ${res.status}`)
      notify(data.note ?? 'Bulk logged.')
      setBulkSelected(new Set())
      setBulkDate(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-card p-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Year</label>
          <select
            value={year}
            onChange={(e) => setQuery({ year: Number(e.target.value) })}
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Month</label>
          <select
            value={month}
            onChange={(e) => setQuery({ month: Number(e.target.value) })}
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            {MONTHS.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Department</label>
          <select
            value={departmentFilter}
            onChange={(e) => setQuery({ department: e.target.value })}
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        {canEdit && bulkSelected.size > 0 && (
          <div className="ml-auto flex flex-wrap items-end gap-2 rounded border border-orange-light bg-orange-light/40 p-2">
            <span className="text-xs text-orange-dark">
              {bulkSelected.size} selected
            </span>
            <input
              type="date"
              value={bulkDate ?? ''}
              onChange={(e) => setBulkDate(e.target.value || null)}
              className="rounded border border-line-strong bg-card px-2 py-1 text-xs"
            />
            <select
              value={bulkType}
              onChange={(e) => setBulkType(e.target.value as AttendanceExceptionType)}
              className="rounded border border-line-strong bg-card px-2 py-1 text-xs"
            >
              {ATTENDANCE_EXCEPTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <button
              onClick={bulkApply}
              disabled={busy || !bulkDate}
              className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy-dark disabled:opacity-50"
            >
              Apply to selected
            </button>
            <button
              onClick={() => setBulkSelected(new Set())}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-4 py-2 text-xs text-ink-2 hover:bg-surface"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-card p-3 text-xs text-ink-3 flex flex-wrap gap-3">
        <Legend swatch="bg-success/30" label="Present (default)" />
        <Legend swatch="bg-info/40" label="WFH / On field" />
        <Legend swatch="bg-warning/50" label="Late / Half-day" />
        <Legend swatch="bg-danger/50" label="Absent" />
        <Legend swatch="bg-line" label="Off / Holiday / Leave" />
        {canEdit && <span className="ml-auto text-ink-3">Click any cell to log or edit.</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 min-w-[200px]">Employee</th>
              {days.map((d) => (
                <th key={d} className="px-1 py-2 text-center min-w-[28px] tabular">
                  {d.slice(-2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grids.map(({ emp, cells }) => (
              <tr key={emp.id} className="border-b border-line/50">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <input
                        type="checkbox"
                        checked={bulkSelected.has(emp.id)}
                        onChange={(e) => {
                          const next = new Set(bulkSelected)
                          if (e.target.checked) next.add(emp.id)
                          else next.delete(emp.id)
                          setBulkSelected(next)
                        }}
                        className="h-4 w-4 accent-orange"
                        aria-label={`Select ${emp.name}`}
                      />
                    )}
                    <div>
                      <div className="text-sm font-medium text-ink">{emp.name}</div>
                      <div className="text-[10px] text-ink-3 tabular">
                        {emp.code} · {emp.department}
                      </div>
                    </div>
                  </div>
                </td>
                {cells.map(({ date, baseKind, exception }) => (
                  <td key={date} className="border-l border-line/30 p-0">
                    <CellButton
                      empId={emp.id}
                      empName={emp.name}
                      date={date}
                      baseKind={baseKind}
                      exception={exception}
                      canEdit={canEdit}
                      isSelected={
                        selectedCell?.empId === emp.id && selectedCell?.date === date
                      }
                      onSelect={() => canEdit && setSelectedCell({ empId: emp.id, date })}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {grids.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-sm text-ink-3" colSpan={days.length + 1}>
                  No employees match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedCell && canEdit && (
        <CellEditor
          empId={selectedCell.empId}
          empName={employees.find((e) => e.id === selectedCell.empId)?.name ?? ''}
          date={selectedCell.date}
          existing={exMap.get(`${selectedCell.empId}|${selectedCell.date}`) ?? null}
          busy={busy}
          onLog={logException}
          onDelete={deleteException}
          onClose={() => setSelectedCell(null)}
        />
      )}

      {statusMsg && (
        <p role="status" aria-live="polite" className="text-xs text-ink-2">
          {statusMsg}
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded ${swatch}`} />
      {label}
    </span>
  )
}

function CellButton({
  empId,
  empName,
  date,
  baseKind,
  exception,
  canEdit,
  isSelected,
  onSelect,
}: {
  empId: string
  empName: string
  date: string
  baseKind: 'office' | 'off' | 'holiday' | 'leave'
  exception: AttendanceException | null
  canEdit: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  void empId
  let bg = 'bg-success/20' // office (present default)
  let label = ''
  let title = `${empName} on ${date}`
  if (baseKind === 'off') {
    bg = 'bg-line'
    title += ' (off)'
  } else if (baseKind === 'holiday') {
    bg = 'bg-line'
    title += ' (holiday)'
  } else if (baseKind === 'leave') {
    bg = 'bg-line'
    title += ' (on leave)'
  }
  if (exception) {
    bg = TYPE_TONE[exception.type]
    label = TYPE_LABEL[exception.type].slice(0, 1)
    title = `${empName} on ${date} — ${TYPE_LABEL[exception.type]}${exception.notes ? ': ' + exception.notes : ''}`
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!canEdit}
      className={`flex h-7 w-7 items-center justify-center text-[10px] font-medium ${bg} ${
        isSelected ? 'ring-2 ring-navy' : ''
      } ${canEdit ? 'cursor-pointer hover:ring-1 hover:ring-ink-3' : 'cursor-default'}`}
      title={title}
      aria-label={title}
    >
      {label}
    </button>
  )
}

function CellEditor({
  empId,
  empName,
  date,
  existing,
  busy,
  onLog,
  onDelete,
  onClose,
}: {
  empId: string
  empName: string
  date: string
  existing: AttendanceException | null
  busy: boolean
  onLog: (args: { empId: string; date: string; type: AttendanceExceptionType; notes: string }) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [type, setType] = useState<AttendanceExceptionType>(existing?.type ?? 'late')
  const [notes, setNotes] = useState(existing?.notes ?? '')

  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg text-ink">
            {empName} — {date}
          </h3>
          {existing && (
            <p className="text-xs text-ink-3">
              Logged {existing.loggedAt.slice(0, 10)} by {existing.loggedBy}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-xs font-medium text-ink-3 hover:text-ink"
        >
          Close
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AttendanceExceptionType)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            {ATTENDANCE_EXCEPTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => onLog({ empId, date, type, notes })}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
        >
          {existing ? 'Save change' : 'Log'}
        </button>
        {existing && (
          <button
            onClick={() => onDelete(existing.id)}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded border border-danger px-4 py-2 text-sm text-danger hover:bg-danger-bg disabled:opacity-50"
          >
            Clear exception
          </button>
        )}
      </div>
    </div>
  )
}
