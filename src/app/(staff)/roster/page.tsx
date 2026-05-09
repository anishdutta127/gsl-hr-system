import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees } from '@/lib/data'
import {
  loadEmployeeOptionalHolidays,
  loadHolidays,
} from '@/lib/holidays'
import { loadLeaveApplications } from '@/lib/leave'
import { RosterView } from './RosterView'

export const dynamic = 'force-dynamic'

export default async function RosterPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string; month?: string; group?: string }>
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role === 'HOD') redirect('/')

  const params = (await searchParams) ?? {}
  const now = new Date()
  const year = Number(params.year) || now.getUTCFullYear()
  const month = Number(params.month) || now.getUTCMonth() + 1
  const group = (params.group ?? 'person') as 'person' | 'department' | 'location'

  const employees = loadEmployees()
    .filter((e) => e.status !== 'Exited')
    .sort((a, b) => a.name.localeCompare(b.name))

  const holidays = loadHolidays()
  const picks = loadEmployeeOptionalHolidays()
  const approvedLeaves = loadLeaveApplications()
    .filter((l) => l.status === 'Approved')
    .map((l) => ({
      employeeId: l.employeeId,
      startDate: l.startDate,
      endDate: l.endDate,
      status: l.status,
      leaveType: l.leaveType,
    }))

  const compactEmployees = employees.map((e) => ({
    id: e.id,
    name: e.name,
    code: e.employeeCode,
    department: e.department || '—',
    location: e.location || '—',
    workPattern: e.workPattern ?? 'office-5day',
  }))

  const compactPicks = picks
    .filter((p) => p.year === year)
    .map((p) => ({ employeeId: p.employeeId, holidayId: p.holidayId }))

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Roster</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Expected office presence by work pattern, with mandatory and picked optional holidays
          excluded. Phase 1 is a planning view only — Phase 4 attendance will track who actually
          showed up.
        </p>
      </div>
      <RosterView
        employees={compactEmployees}
        holidays={holidays}
        picks={compactPicks}
        approvedLeaves={approvedLeaves}
        year={year}
        month={month}
        group={group}
      />
    </div>
  )
}
