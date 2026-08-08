import { requireRoles } from '@/lib/guards'
import { loadEmployees, loadUsers } from '@/lib/data'
import { currentMonth, formatMonthLabel } from '@/lib/recognition'
import { RECOGNITION_CATEGORIES } from '@/lib/types'
import { NominateForm } from './NominateForm'

export const dynamic = 'force-dynamic'

/**
 * HOD-facing nomination submission page. Also reachable by Admin + HR for
 * the cases where HR wants to seed a recognition directly without waiting
 * for the HOD email round-trip.
 *
 * Department gate for HOD: the form options only show employees in the
 * HOD's recorded department. The API enforces the same rule -- this is
 * a UI affordance, not the security boundary.
 */
export default async function NominatePage() {
  const session = await requireRoles(['Admin', 'HR', 'HOD'])
  const employees = (await loadEmployees()).filter((e) => e.status === 'Active')
  const users = await loadUsers()

  // HOD: limit the dropdown to their department. We resolve the HOD's
  // department by looking up the employee record that shares their email.
  // (Phase 1 muster import seeds employees with the same email as the
  // staff user record, so this round-trip is reliable.)
  let actorDepartment: string | undefined
  if (session.role === 'HOD') {
    const matchingEmployee = employees.find(
      (e) => e.email.toLowerCase() === session.email.toLowerCase(),
    )
    actorDepartment = matchingEmployee?.department
  }

  const employeeOptions =
    session.role === 'HOD' && actorDepartment
      ? employees.filter((e) => e.department === actorDepartment)
      : employees

  // Sort employees alphabetically for the dropdown. Stable, predictable.
  employeeOptions.sort((a, b) => a.name.localeCompare(b.name))

  const month = currentMonth()

  return (
    <div className="container-page py-8">
      <h1 className="font-display text-2xl text-ink">Nominate for recognition</h1>
      <p className="mt-1 text-sm text-ink-2">
        Recognise an employee for {formatMonthLabel(month)}. Once you submit, HR will
        review the nomination and publish the recognition card.
      </p>

      {session.role === 'HOD' && !actorDepartment && (
        <div
          role="alert"
          className="mt-4 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          We could not find your department in the employee master. Ask HR to confirm
          your record before nominating.
        </div>
      )}

      {employeeOptions.length === 0 && actorDepartment && (
        <div
          role="status"
          className="mt-4 rounded border border-warning bg-warning-bg px-3 py-2 text-sm text-ink"
        >
          No active employees are listed in your department ({actorDepartment}). Ask HR
          to confirm the muster.
        </div>
      )}

      <NominateForm
        defaultMonth={month}
        categories={[...RECOGNITION_CATEGORIES]}
        employees={employeeOptions.map((e) => ({
          id: users.find((u) => u.email.toLowerCase() === e.email.toLowerCase())?.id ?? e.id,
          name: e.name,
          department: e.department,
          designation: e.designation,
        }))}
      />
    </div>
  )
}
