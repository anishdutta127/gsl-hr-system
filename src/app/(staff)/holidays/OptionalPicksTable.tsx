'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EmployeeOptionalHoliday, Holiday } from '@/lib/types'
import { OPTIONAL_HOLIDAY_BUDGET_PER_YEAR } from '@/lib/types'

interface EmployeeRef {
  id: string
  name: string
  code: string
}

export function OptionalPicksTable({
  employees,
  optional,
  picks,
  year,
}: {
  employees: EmployeeRef[]
  optional: Holiday[]
  picks: EmployeeOptionalHoliday[]
  year: number
}) {
  const [filter, setFilter] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const pickIndex = useMemo(() => {
    const set = new Set<string>()
    for (const p of picks) {
      if (p.year === year) set.add(`${p.employeeId}|${p.holidayId}`)
    }
    return set
  }, [picks, year])

  const countByEmployee = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of picks) {
      if (p.year !== year) continue
      counts.set(p.employeeId, (counts.get(p.employeeId) ?? 0) + 1)
    }
    return counts
  }, [picks, year])

  const filtered = filter.trim()
    ? employees.filter(
        (e) =>
          e.name.toLowerCase().includes(filter.toLowerCase()) ||
          e.code.toLowerCase().includes(filter.toLowerCase()),
      )
    : employees

  async function toggle(employeeId: string, holidayId: string) {
    const key = `${employeeId}|${holidayId}`
    setBusyKey(key)
    setError(null)
    try {
      const res = await fetch('/api/admin/holidays/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, holidayId, year }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Toggle failed: ${res.status}`)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div>
      <div className="border-b border-line px-5 py-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or code..."
          className="w-full max-w-md rounded border border-line-strong bg-card px-3 py-1.5 text-sm"
        />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
      <div className="max-h-[600px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
              <th className="px-5 py-2 sticky left-0 bg-card">Employee</th>
              {optional.map((h) => (
                <th key={h.id} className="px-3 py-2 text-center min-w-[120px]">
                  <div>{h.name}</div>
                  <div className="text-[10px] font-normal lowercase tracking-normal text-ink-3">
                    {h.date}
                  </div>
                </th>
              ))}
              <th className="px-5 py-2 text-right">Used</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp) => {
              const used = countByEmployee.get(emp.id) ?? 0
              return (
                <tr key={emp.id} className="border-b border-line/50">
                  <td className="px-5 py-2 sticky left-0 bg-card">
                    <div className="font-medium text-ink">{emp.name}</div>
                    <div className="text-xs text-ink-3 tabular">{emp.code}</div>
                  </td>
                  {optional.map((h) => {
                    const key = `${emp.id}|${h.id}`
                    const checked = pickIndex.has(key)
                    const wouldExceed = !checked && used >= OPTIONAL_HOLIDAY_BUDGET_PER_YEAR
                    return (
                      <td key={h.id} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busyKey === key || wouldExceed}
                          onChange={() => toggle(emp.id, h.id)}
                          aria-label={`${emp.name} picks ${h.name}`}
                          className="h-4 w-4 cursor-pointer accent-orange disabled:cursor-not-allowed disabled:opacity-50"
                          title={wouldExceed ? `${emp.name} has used all ${OPTIONAL_HOLIDAY_BUDGET_PER_YEAR} picks` : undefined}
                        />
                      </td>
                    )
                  })}
                  <td className="px-5 py-2 text-right tabular text-ink">
                    <span className={used >= OPTIONAL_HOLIDAY_BUDGET_PER_YEAR ? 'text-orange-dark font-medium' : ''}>
                      {used}/{OPTIONAL_HOLIDAY_BUDGET_PER_YEAR}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
