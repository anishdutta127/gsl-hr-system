'use client'

import { useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  cellSymbol,
  daysInMonth,
  defaultHybridDays,
  expectedDayKind,
  holidayDateSet,
  monthGridForEmployee,
  summariseMonth,
} from '@/lib/roster'
import type { Holiday, WorkPattern } from '@/lib/types'

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
}
type Group = 'person' | 'department' | 'location'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function RosterView({
  employees,
  holidays,
  picks,
  year,
  month,
  group,
}: {
  employees: CompactEmployee[]
  holidays: Holiday[]
  picks: CompactPick[]
  year: number
  month: number
  group: Group
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [department, setDepartment] = useState<string>('')
  const [location, setLocation] = useState<string>('')
  const [workPattern, setWorkPattern] = useState<WorkPattern | ''>('')

  function setQuery(next: Partial<{ year: number; month: number; group: Group }>) {
    const params = new URLSearchParams()
    params.set('year', String(next.year ?? year))
    params.set('month', String(next.month ?? month))
    params.set('group', next.group ?? group)
    router.push(`${pathname}?${params.toString()}`)
  }

  // picks lookup
  const picksByEmployee = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const p of picks) {
      if (!map.has(p.employeeId)) map.set(p.employeeId, new Set())
      map.get(p.employeeId)!.add(p.holidayId)
    }
    return map
  }, [picks])

  const days = useMemo(() => daysInMonth(year, month), [year, month])

  const filtered = employees.filter(
    (e) =>
      (!department || e.department === department) &&
      (!location || e.location === location) &&
      (!workPattern || e.workPattern === workPattern),
  )

  const allDepartments = [...new Set(employees.map((e) => e.department))].sort()
  const allLocations = [...new Set(employees.map((e) => e.location))].sort()

  const empGrids = filtered.map((emp) => {
    const pickedIds = picksByEmployee.get(emp.id) ?? new Set<string>()
    const dates = holidayDateSet(holidays, pickedIds)
    const hybridDays = defaultHybridDays(emp.department)
    const cells = monthGridForEmployee({
      workPattern: emp.workPattern,
      hybridDays,
      year,
      month1to12: month,
      holidayDates: dates,
    })
    const summary = summariseMonth(cells)
    return { emp, cells, summary, hybridDays }
  })

  function exportCsv() {
    const header = ['Code', 'Name', 'Department', 'Location', 'Pattern', ...days, 'Office', 'Off', 'Holiday']
    const lines = [header.join(',')]
    for (const { emp, cells, summary } of empGrids) {
      const row = [
        emp.code,
        `"${emp.name}"`,
        `"${emp.department}"`,
        `"${emp.location}"`,
        emp.workPattern,
        ...cells.map((c) => cellSymbol(c.kind)),
        String(summary.office),
        String(summary.off),
        String(summary.holiday),
      ]
      lines.push(row.join(','))
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `roster-${year}-${String(month).padStart(2, '0')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Optional grouping aggregation: when group != 'person', we render a roll-up
  // showing total office-days vs. holidays per group.
  const groupedSummary =
    group === 'person'
      ? null
      : aggregateByGroup(empGrids, group === 'department' ? 'department' : 'location')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-line bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Year</label>
            <select
              value={year}
              onChange={(e) => setQuery({ year: Number(e.target.value) })}
              className="mt-1 rounded border border-line-strong bg-card px-2 py-1 text-sm"
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
              className="mt-1 rounded border border-line-strong bg-card px-2 py-1 text-sm"
            >
              {MONTHS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Group by</label>
            <select
              value={group}
              onChange={(e) => setQuery({ group: e.target.value as Group })}
              className="mt-1 rounded border border-line-strong bg-card px-2 py-1 text-sm"
            >
              <option value="person">Person</option>
              <option value="department">Department</option>
              <option value="location">Location</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="mt-1 rounded border border-line-strong bg-card px-2 py-1 text-sm"
            >
              <option value="">All</option>
              {allDepartments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Location</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 rounded border border-line-strong bg-card px-2 py-1 text-sm"
            >
              <option value="">All</option>
              {allLocations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Pattern</label>
            <select
              value={workPattern}
              onChange={(e) => setWorkPattern(e.target.value as WorkPattern | '')}
              className="mt-1 rounded border border-line-strong bg-card px-2 py-1 text-sm"
            >
              <option value="">All</option>
              <option value="office-5day">Office 5-day</option>
              <option value="trainer-6day">Trainer 6-day</option>
              <option value="hybrid-2day">Hybrid 2-day</option>
              <option value="field">Field</option>
              <option value="remote">Remote</option>
            </select>
          </div>
        </div>
        <button
          onClick={exportCsv}
          className="rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
        >
          Export CSV
        </button>
      </div>

      <div className="rounded-lg border border-line bg-card text-xs text-ink-3 px-4 py-2 flex gap-4">
        <span><span className="text-ink font-medium">O</span> = Office day</span>
        <span><span className="text-ink-2">−</span> = Off day</span>
        <span><span className="text-orange-dark font-medium">H</span> = Holiday</span>
      </div>

      {group === 'person' ? (
        <PersonGrid empGrids={empGrids} days={days} />
      ) : (
        <GroupedSummary rows={groupedSummary!} />
      )}
    </div>
  )
}

function PersonGrid({
  empGrids,
  days,
}: {
  empGrids: Array<{
    emp: CompactEmployee
    cells: Array<{ date: string; kind: 'office' | 'off' | 'holiday' }>
    summary: { office: number; off: number; holiday: number }
  }>
  days: string[]
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
            <th className="sticky left-0 z-10 bg-card px-3 py-2 min-w-[200px]">Employee</th>
            <th className="px-2 py-2">Pattern</th>
            {days.map((d) => (
              <th key={d} className="px-1 py-2 text-center min-w-[24px]">
                {d.slice(-2)}
              </th>
            ))}
            <th className="px-2 py-2 text-right">O</th>
            <th className="px-2 py-2 text-right">−</th>
            <th className="px-2 py-2 text-right">H</th>
          </tr>
        </thead>
        <tbody>
          {empGrids.map(({ emp, cells, summary }) => (
            <tr key={emp.id} className="border-b border-line/50">
              <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                <div className="text-sm font-medium text-ink">{emp.name}</div>
                <div className="text-[10px] text-ink-3 tabular">{emp.code} · {emp.department} · {emp.location}</div>
              </td>
              <td className="px-2 py-1.5 text-ink-2 text-[11px]">{emp.workPattern}</td>
              {cells.map((c) => (
                <td key={c.date} className="px-1 py-1.5 text-center">
                  <CellLabel kind={c.kind} />
                </td>
              ))}
              <td className="px-2 py-1.5 text-right tabular text-ink">{summary.office}</td>
              <td className="px-2 py-1.5 text-right tabular text-ink-3">{summary.off}</td>
              <td className="px-2 py-1.5 text-right tabular text-orange-dark">{summary.holiday}</td>
            </tr>
          ))}
          {empGrids.length === 0 && (
            <tr>
              <td className="px-5 py-6 text-sm text-ink-3" colSpan={days.length + 5}>
                No employees match the current filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function CellLabel({ kind }: { kind: 'office' | 'off' | 'holiday' }) {
  if (kind === 'office') return <span className="font-medium text-ink">O</span>
  if (kind === 'holiday') return <span className="font-medium text-orange-dark">H</span>
  return <span className="text-ink-3">−</span>
}

interface GroupSummaryRow {
  group: string
  headcount: number
  totalOffice: number
  totalOff: number
  totalHoliday: number
}

function aggregateByGroup(
  empGrids: Array<{
    emp: CompactEmployee
    summary: { office: number; off: number; holiday: number }
  }>,
  field: 'department' | 'location',
): GroupSummaryRow[] {
  const map = new Map<string, GroupSummaryRow>()
  for (const { emp, summary } of empGrids) {
    const key = field === 'department' ? emp.department : emp.location
    const row =
      map.get(key) ??
      ({ group: key, headcount: 0, totalOffice: 0, totalOff: 0, totalHoliday: 0 } as GroupSummaryRow)
    row.headcount += 1
    row.totalOffice += summary.office
    row.totalOff += summary.off
    row.totalHoliday += summary.holiday
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.headcount - a.headcount || a.group.localeCompare(b.group))
}

function GroupedSummary({ rows }: { rows: GroupSummaryRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
            <th className="px-5 py-2">Group</th>
            <th className="px-3 py-2 text-right">Headcount</th>
            <th className="px-3 py-2 text-right">Office days</th>
            <th className="px-3 py-2 text-right">Off days</th>
            <th className="px-3 py-2 text-right">Holiday days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.group} className="border-b border-line/50">
              <td className="px-5 py-2 font-medium text-ink">{r.group}</td>
              <td className="px-3 py-2 text-right tabular">{r.headcount}</td>
              <td className="px-3 py-2 text-right tabular">{r.totalOffice}</td>
              <td className="px-3 py-2 text-right tabular text-ink-3">{r.totalOff}</td>
              <td className="px-3 py-2 text-right tabular text-orange-dark">{r.totalHoliday}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-5 py-6 text-sm text-ink-3" colSpan={5}>
                No employees match the current filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
