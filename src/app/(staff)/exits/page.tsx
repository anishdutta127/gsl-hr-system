import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees } from '@/lib/data'
import {
  canReopenExitProcess,
  exitArchivedAt,
  isArchivedExit,
  loadExitProcesses,
  loadExitStepTemplates,
  outstandingStepNames,
  summariseExit,
} from '@/lib/exitProcess'
import { InitiateExitPicker, type PickerEmployee } from './InitiateExitPicker'
import { ExitBoard, type BoardRow } from './ExitBoard'

export const dynamic = 'force-dynamic'

/**
 * Exits board - the single home for the exit lifecycle. In-progress exits
 * carry their live six-step checklist status; completed OR explicitly closed
 * exits drop into the Alumni group, out of the active /employees roster. HR and
 * Admin can close any exit (even with steps outstanding) and reopen a misfire.
 * Open to all staff; HOD sees only their direct reports, Leadership read-only.
 */
export default async function ExitsPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isLeadership = session.role === 'Leadership'
  const isHod = session.role === 'HOD'
  if (!isHrOrAdmin && !isLeadership && !isHod) redirect('/')

  const employees = loadEmployees()
  const employeeById = new Map(employees.map((e) => [e.id, e] as const))
  const processes = loadExitProcesses()
  const templates = loadExitStepTemplates()
  const now = new Date().toISOString()
  // Steps a legacy exit would carry once a checklist is created (initiate is
  // recorded on creation) - shown in the close confirmation for legacy rows.
  const legacyOutstanding = templates
    .filter((t) => t.isMandatory && t.kind !== 'initiate')
    .map((t) => t.name)

  function inScope(employeeId: string): boolean {
    if (isHrOrAdmin || isLeadership) return true
    const emp = employeeById.get(employeeId)
    return Boolean(emp && emp.reportingManagerId === session!.sub)
  }

  const procRows: BoardRow[] = processes
    .filter((p) => inScope(p.employeeId))
    .flatMap((p) => {
      const employee = employeeById.get(p.employeeId)
      if (!employee) return []
      const summary = summariseExit(p)
      const archived = isArchivedExit(p)
      return [
        {
          employeeId: p.employeeId,
          name: employee.name,
          designation: employee.designation ?? null,
          department: employee.department ?? null,
          lastWorkingDay: p.lastWorkingDay || null,
          percent: summary.percent,
          isComplete: summary.isComplete,
          group: archived ? 'alumni' : 'in-progress',
          hasChecklist: true,
          closedAt: p.closedAt ?? null,
          closeReason: p.closeReason ?? null,
          archivedAt: exitArchivedAt(p),
          outstandingSteps: outstandingStepNames(p),
          canReopen: canReopenExitProcess(session, p, now),
        } satisfies BoardRow,
      ]
    })

  // Exited employees with no checklist yet (legacy exits before this reshape).
  const trackedIds = new Set(processes.map((p) => p.employeeId))
  const legacyRows: BoardRow[] = employees
    .filter((e) => e.status === 'Exited' && !trackedIds.has(e.id) && inScope(e.id))
    .map(
      (e) =>
        ({
          employeeId: e.id,
          name: e.name,
          designation: e.designation ?? null,
          department: e.department ?? null,
          lastWorkingDay: e.exit?.lastWorkingDay ?? null,
          percent: 0,
          isComplete: false,
          group: 'legacy',
          hasChecklist: false,
          closedAt: null,
          closeReason: null,
          archivedAt: null,
          outstandingSteps: legacyOutstanding,
          canReopen: false,
        }) satisfies BoardRow,
    )

  const active: PickerEmployee[] = employees
    .filter((e) => e.status === 'Active')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      id: e.id,
      name: e.name,
      designation: e.designation ?? null,
      department: e.department ?? null,
      employeeCode: e.employeeCode ?? null,
    }))

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Exits</h1>
        <p className="mt-1 text-sm text-ink-2">
          Drive each exit end-to-end from one page: handover, no dues, settlement, relieving and
          experience letters. For the active roster use{' '}
          <Link href="/employees" className="font-medium text-navy hover:underline">
            Employees
          </Link>
          .{isHod && ' Showing your direct reports only.'}
        </p>
      </div>

      {isHrOrAdmin && (
        <div className="mb-8">
          <InitiateExitPicker employees={active} />
        </div>
      )}

      <ExitBoard rows={[...procRows, ...legacyRows]} canEdit={isHrOrAdmin} />
    </div>
  )
}
