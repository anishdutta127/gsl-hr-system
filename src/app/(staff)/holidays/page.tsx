import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees } from '@/lib/data'
import {
  holidayDayOfWeek,
  holidaysInYear,
  loadEmployeeOptionalHolidays,
  loadHolidays,
  sortHolidays,
} from '@/lib/holidays'
import { OPTIONAL_HOLIDAY_BUDGET_PER_YEAR } from '@/lib/types'
import { HolidayList } from './HolidayList'
import { OptionalPicksTable } from './OptionalPicksTable'

export const dynamic = 'force-dynamic'

const YEAR = 2026

export default async function HolidaysPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  const canEdit = session.role === 'Admin' || session.role === 'HR'

  const all = loadHolidays()
  const sorted = sortHolidays(holidaysInYear(all, YEAR))
  const mandatory = sorted.filter((h) => h.type === 'mandatory')
  const optional = sorted.filter((h) => h.type === 'optional')

  const employees = loadEmployees()
    .filter((e) => e.status !== 'Exited')
    .sort((a, b) => a.name.localeCompare(b.name))
  const picks = loadEmployeeOptionalHolidays()

  const optionalWithDay = optional.map((h) => ({ ...h, dayOfWeek: holidayDayOfWeek(h.date) }))
  const mandatoryWithDay = mandatory.map((h) => ({ ...h, dayOfWeek: holidayDayOfWeek(h.date) }))

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Holiday calendar — {YEAR}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {mandatory.length} mandatory and {optional.length} optional holidays. Each employee
            picks up to {OPTIONAL_HOLIDAY_BUDGET_PER_YEAR} optionals per year.
          </p>
        </div>
        <div className="text-sm text-ink-3">
          Optional pick budget: <span className="font-medium text-ink">{OPTIONAL_HOLIDAY_BUDGET_PER_YEAR} / year</span>
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-card">
        <header className="border-b border-line px-5 py-4">
          <h2 className="font-display text-lg text-ink">Mandatory holidays</h2>
          <p className="mt-1 text-sm text-ink-2">Applies to every employee, no opt-in needed.</p>
        </header>
        <HolidayList holidays={mandatoryWithDay} canEdit={canEdit} />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-card">
        <header className="border-b border-line px-5 py-4">
          <h2 className="font-display text-lg text-ink">Optional holidays</h2>
          <p className="mt-1 text-sm text-ink-2">
            Each employee picks {OPTIONAL_HOLIDAY_BUDGET_PER_YEAR} of these. Default budget;
            change in CLAUDE.md if Riddhi opens it up.
          </p>
        </header>
        <HolidayList holidays={optionalWithDay} canEdit={canEdit} />
      </section>

      {canEdit && (
        <section className="rounded-lg border border-line bg-card">
          <header className="border-b border-line px-5 py-4">
            <h2 className="font-display text-lg text-ink">Per-employee optional picks</h2>
            <p className="mt-1 text-sm text-ink-2">
              Toggle which optionals each employee has chosen. Limit: {OPTIONAL_HOLIDAY_BUDGET_PER_YEAR} per year.
            </p>
          </header>
          <OptionalPicksTable
            employees={employees.map((e) => ({ id: e.id, name: e.name, code: e.employeeCode }))}
            optional={optional}
            picks={picks}
            year={YEAR}
          />
        </section>
      )}
    </div>
  )
}
