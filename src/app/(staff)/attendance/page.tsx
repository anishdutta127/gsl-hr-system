import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees } from '@/lib/data'
import {
  loadEmployeeOptionalHolidays,
  loadHolidays,
} from '@/lib/holidays'
import { loadLeaveApplications } from '@/lib/leave'
import { loadAttendanceExceptions } from '@/lib/attendance'
import { AttendanceCalendar } from './AttendanceCalendar'

export const dynamic = 'force-dynamic'

export default async function AttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string; month?: string; department?: string }>
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isLeadership = session.role === 'Leadership'
  const isHod = session.role === 'HOD'
  if (!isHrOrAdmin && !isLeadership && !isHod) redirect('/')

  const params = (await searchParams) ?? {}
  const now = new Date()
  const year = Number(params.year) || now.getUTCFullYear()
  const month = Number(params.month) || now.getUTCMonth() + 1
  const departmentFilter = params.department ?? ''

  let employees = loadEmployees().filter((e) => e.status !== 'Exited')
  if (isHod) {
    employees = employees.filter((e) => e.reportingManagerId === session.sub)
  }
  if (departmentFilter) {
    employees = employees.filter((e) => e.department === departmentFilter)
  }
  employees.sort((a, b) => a.name.localeCompare(b.name))

  const departments = Array.from(
    new Set(loadEmployees().map((e) => e.department).filter(Boolean)),
  ).sort()

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
  const exceptions = loadAttendanceExceptions()

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Attendance</h1>
        <p className="mt-1 text-sm text-ink-2">
          System assumes everyone is present unless an exception is logged. Click any cell to
          record a late arrival, half-day, absence, WFH, on-field day, or holiday-worked.
          {isHod && ' Showing your direct reports only.'}
        </p>
      </div>

      <AttendanceCalendar
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          code: e.employeeCode,
          department: e.department,
          location: e.location,
          workPattern: e.workPattern ?? 'office-5day',
        }))}
        holidays={holidays}
        picks={picks.map((p) => ({ employeeId: p.employeeId, holidayId: p.holidayId, year: p.year }))}
        approvedLeaves={approvedLeaves}
        exceptions={exceptions}
        year={year}
        month={month}
        departments={departments}
        departmentFilter={departmentFilter}
        canEdit={isHrOrAdmin}
      />
    </div>
  )
}
