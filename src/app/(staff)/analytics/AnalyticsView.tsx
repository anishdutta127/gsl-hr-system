'use client'

import { usePathname, useRouter } from 'next/navigation'
import type {
  AttendanceWidget,
  AttritionWidget,
  HeadcountWidget,
  HrOpsMetricsWidget,
  LeaveUtilisationWidget,
} from '@/lib/analytics'

const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function AnalyticsView({
  headcount,
  attrition,
  attendance,
  leaveUtil,
  hrOps,
  filter,
  departments,
  locations,
}: {
  headcount: HeadcountWidget
  attrition: AttritionWidget
  attendance: AttendanceWidget
  leaveUtil: LeaveUtilisationWidget
  hrOps: HrOpsMetricsWidget
  filter: { rangeStart: string; rangeEnd: string; department?: string; location?: string }
  departments: string[]
  locations: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()

  function setFilter(name: string, value: string) {
    const params = new URLSearchParams()
    if (filter.rangeStart) params.set('from', filter.rangeStart)
    if (filter.rangeEnd) params.set('to', filter.rangeEnd)
    if (filter.department) params.set('department', filter.department)
    if (filter.location) params.set('location', filter.location)
    if (value) params.set(name, value)
    else params.delete(name)
    router.push(`${pathname}?${params.toString()}`)
  }

  function exportCsv() {
    const blocks: string[] = []
    blocks.push('# Headcount overview')
    blocks.push(['Total', 'Active', 'Exited', 'OnProbation'].join(','))
    blocks.push([headcount.total, headcount.active, headcount.exited, headcount.onProbation].join(','))
    blocks.push('')
    blocks.push('# Headcount by department')
    blocks.push(['Department', 'Count'].join(','))
    headcount.byDepartment.forEach((r) => blocks.push([`"${r.key}"`, r.count].join(',')))
    blocks.push('')
    blocks.push('# Headcount trend (last 12 months)')
    blocks.push(['Month', 'Active'].join(','))
    headcount.trend12Months.forEach((r) => blocks.push([r.month, r.activeCount].join(',')))
    blocks.push('')
    blocks.push('# Attrition (last 90 days)')
    blocks.push(`Exits,${attrition.exitsLast90Days}`)
    blocks.push(`Rate,${attrition.attritionRate}%`)
    blocks.push(`AvgTenureYears,${attrition.avgTenureYearsAtExit ?? ''}`)
    blocks.push('')
    blocks.push('# Attendance')
    blocks.push(`PresentRate,${attendance.presentRate}%`)
    blocks.push('')
    blocks.push('# Leave utilisation')
    blocks.push(`Entitled,${leaveUtil.totalEntitled}`)
    blocks.push(`Taken,${leaveUtil.totalTaken}`)
    blocks.push(`LOP,${leaveUtil.totalLOP}`)
    blocks.push(`UtilisationPct,${leaveUtil.utilisationPct}%`)
    blocks.push(`PredictedYearEndUtilisationPct,${leaveUtil.predictedYearEndUtilisationPct}%`)
    blocks.push('')
    blocks.push('# HR Ops metrics')
    blocks.push(`AvgDaysToOnboardingComplete,${hrOps.avgDaysToOnboardingComplete ?? ''}`)
    blocks.push(`OnboardingTasksOnTimePct,${hrOps.pctOnboardingTasksOnTime}%`)
    blocks.push(`DocumentComplianceRate,${hrOps.documentComplianceRate}%`)
    blocks.push(`OpenOffboardingTasks,${hrOps.openOffboardingTasks}`)

    const csv = blocks.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-card p-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">From</label>
          <input
            type="date"
            value={filter.rangeStart}
            onChange={(e) => setFilter('from', e.target.value)}
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">To</label>
          <input
            type="date"
            value={filter.rangeEnd}
            onChange={(e) => setFilter('to', e.target.value)}
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Department</label>
          <select
            value={filter.department ?? ''}
            onChange={(e) => setFilter('department', e.target.value)}
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
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">Location</label>
          <select
            value={filter.location ?? ''}
            onChange={(e) => setFilter('location', e.target.value)}
            className="mt-1 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={exportCsv}
          className="ml-auto inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          Export CSV
        </button>
      </div>

      {/* Widget 1 — Headcount */}
      <Card title="Headcount" subtitle="Active employees with department + location breakdowns and 12-month trend.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total" value={headcount.total} />
          <Stat label="Active" value={headcount.active} />
          <Stat label="On probation" value={headcount.onProbation} tone={headcount.onProbation > 0 ? 'warning' : 'ok'} />
          <Stat label="Exited (window)" value={headcount.exited} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BarList title="By department" rows={headcount.byDepartment} />
          <BarList title="By location" rows={headcount.byLocation} />
        </div>
        <Sparkline title="Active employees, last 12 months" points={headcount.trend12Months.map((p) => ({ label: p.month, value: p.activeCount }))} />
      </Card>

      {/* Widget 2 — Attrition */}
      <Card title="Attrition" subtitle="Exits in the last 90 days, by department, top reasons, average tenure at exit.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Exits (90d)" value={attrition.exitsLast90Days} tone={attrition.exitsLast90Days > 0 ? 'warning' : 'ok'} />
          <Stat label="Attrition rate" value={`${attrition.attritionRate}%`} />
          <Stat label="Avg tenure (yrs)" value={attrition.avgTenureYearsAtExit ?? '—'} />
          <Stat label="Top reasons" value={attrition.topReasons.length} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BarList title="Exits by department" rows={attrition.byDepartment} />
          <BarList
            title="Top reasons"
            rows={attrition.topReasons.map((r) => ({ key: r.reason, count: r.count }))}
          />
        </div>
      </Card>

      {/* Widget 3 — Attendance */}
      <Card title="Attendance" subtitle="Exception-based: present-rate, top exception types, late-arrival heatmap by day-of-week.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="% present (avg)" value={`${attendance.presentRate}%`} />
          <Stat label="Top exception" value={attendance.topExceptions[0]?.type ?? '—'} />
          <Stat label="Late this window" value={attendance.lateByDayOfWeek.reduce((a, b) => a + b.count, 0)} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BarList
            title="Top exceptions"
            rows={attendance.topExceptions.map((r) => ({ key: r.type, count: r.count }))}
          />
          <DowHeatmap rows={attendance.lateByDayOfWeek} />
        </div>
        <BarList
          title="Exception rate by department"
          rows={attendance.byDepartmentExceptionRate.map((r) => ({ key: r.key, count: r.rate }))}
          unit="%"
        />
      </Card>

      {/* Widget 4 — Leave */}
      <Card title="Leave utilisation" subtitle="Taken vs entitled, by department, balance distribution, year-end projection.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Entitled" value={leaveUtil.totalEntitled} />
          <Stat label="Taken" value={leaveUtil.totalTaken} />
          <Stat label="LOP" value={leaveUtil.totalLOP} tone={leaveUtil.totalLOP > 0 ? 'warning' : 'ok'} />
          <Stat label="Utilisation" value={`${leaveUtil.utilisationPct}%`} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BarList
            title="Average leaves taken by department"
            rows={leaveUtil.byDepartment.map((r) => ({ key: r.key, count: r.takenAvg }))}
          />
          <BarList
            title="Balance distribution (days remaining)"
            rows={leaveUtil.balanceDistribution.map((r) => ({ key: r.bucket, count: r.count }))}
          />
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Predicted year-end utilisation:{' '}
          <span className="font-medium text-ink">{leaveUtil.predictedYearEndUtilisationPct}%</span>
          {' '}(extrapolated from year-to-date pace).
        </p>
      </Card>

      {/* Widget 5 — HR Ops */}
      <Card title="HR operations metrics" subtitle="Onboarding cycle time, on-time task completion, document compliance, open offboarding tasks.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Avg days to onboard"
            value={hrOps.avgDaysToOnboardingComplete ?? '—'}
          />
          <Stat label="On-time onboarding tasks" value={`${hrOps.pctOnboardingTasksOnTime}%`} />
          <Stat label="Document compliance" value={`${hrOps.documentComplianceRate}%`} />
          <Stat
            label="Open offboarding tasks"
            value={hrOps.openOffboardingTasks}
            tone={hrOps.openOffboardingTasks > 0 ? 'warning' : 'ok'}
          />
        </div>
      </Card>
    </div>
  )
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-card p-5">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Stat({
  label,
  value,
  tone = 'ok',
}: {
  label: string
  value: string | number
  tone?: 'ok' | 'warning' | 'danger'
}) {
  const colors = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-ink'
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className={`font-display text-2xl tabular ${colors}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  )
}

function BarList({
  title,
  rows,
  unit = '',
}: {
  title: string
  rows: Array<{ key: string; count: number }>
  unit?: string
}) {
  if (rows.length === 0) {
    return (
      <div>
        <div className="text-xs uppercase tracking-wider text-ink-3">{title}</div>
        <p className="mt-2 text-xs text-ink-3">No data.</p>
      </div>
    )
  }
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wider text-ink-3">{title}</div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-ink">{r.key}</span>
              <span className="tabular text-ink-2">
                {r.count}
                {unit}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-line">
              <div className="h-full bg-navy" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Sparkline({ title, points }: { title: string; points: Array<{ label: string; value: number }> }) {
  if (points.length === 0) return null
  const max = Math.max(...points.map((p) => p.value), 1)
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs uppercase tracking-wider text-ink-3">{title}</div>
      <div className="flex h-16 items-end gap-1">
        {points.map((p) => (
          <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-sm bg-navy"
              style={{ height: `${(p.value / max) * 100}%` }}
              title={`${p.label}: ${p.value}`}
            />
            <span className="text-[9px] text-ink-3">{p.label.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DowHeatmap({ rows }: { rows: Array<{ dow: number; count: number }> }) {
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wider text-ink-3">Late by day of week</div>
      <div className="flex gap-1">
        {rows.map((r) => (
          <div key={r.dow} className="flex flex-1 flex-col items-center">
            <div
              className="h-12 w-full rounded-sm"
              style={{
                backgroundColor: `rgba(245, 158, 11, ${0.15 + 0.7 * (r.count / max)})`,
              }}
              title={`${DOW_LABEL[r.dow]}: ${r.count}`}
            />
            <span className="mt-1 text-[10px] text-ink-3">{DOW_LABEL[r.dow]}</span>
            <span className="text-[10px] tabular text-ink">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
