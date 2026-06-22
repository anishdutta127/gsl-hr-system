/*
 * Initiate an exit: creates the ExitProcess (six steps, the first marked
 * Completed) AND queues the employee.status -> 'Exited' flip.
 *
 *   POST /api/admin/exits/[employeeId]/initiate
 *     body: { exitType, reasonForLeaving, resignationDate?, terminationDate?,
 *             lastWorkingDay, notes? }
 *
 * Writes:
 *   - exit_processes.json via atomicUpdateJson (offboarding mutation, audited).
 *   - employees.json via the queue (exit.initiate op), same as the legacy
 *     exit flow - employees.json is queue-managed everywhere.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  canEditExitProcess,
  createExitProcessRecord,
  findExitProcess,
  loadExitProcesses,
  loadExitStepTemplates,
} from '@/lib/exitProcess'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { EXIT_TYPES, type ExitProcess, type ExitType } from '@/lib/types'

export const runtime = 'nodejs'

const PROCESSES_PATH = 'src/data/exit_processes.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface Body {
  exitType?: unknown
  reasonForLeaving?: unknown
  resignationDate?: unknown
  terminationDate?: unknown
  lastWorkingDay?: unknown
  notes?: unknown
}

export async function POST(
  request: Request,
  { params }: { params: { employeeId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (!canEditExitProcess(session)) return bad('Only Admin or HR can initiate an exit.', 403)

  const employee = findEmployeeById(params.employeeId)
  if (!employee) return bad('Employee not found.', 404)
  if (findExitProcess(employee.id)) return bad('An exit is already in progress for this employee.', 409)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }

  const exitType = (typeof body.exitType === 'string' ? body.exitType : 'Voluntary') as ExitType
  if (!EXIT_TYPES.includes(exitType)) return bad(`exitType must be one of: ${EXIT_TYPES.join(', ')}.`)

  const reasonForLeaving = typeof body.reasonForLeaving === 'string' ? body.reasonForLeaving.trim().slice(0, 500) : ''
  const lastWorkingDay = typeof body.lastWorkingDay === 'string' ? body.lastWorkingDay : ''
  const resignationDate = typeof body.resignationDate === 'string' && body.resignationDate ? body.resignationDate : null
  const terminationDate = typeof body.terminationDate === 'string' && body.terminationDate ? body.terminationDate : null
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 5000) : ''

  if (!reasonForLeaving) return bad('Reason for leaving is required.')
  if (!lastWorkingDay) return bad('Last working day is required.')
  if (exitType === 'Termination' && !terminationDate) return bad('Termination date is required for a termination.')

  const now = new Date().toISOString()
  const templates = loadExitStepTemplates()
  const process = createExitProcessRecord({
    employee,
    templates,
    exitType,
    reasonForLeaving,
    resignationDate,
    terminationDate,
    lastWorkingDay,
    by: session.email,
    now,
  })

  // 1) Persist the exit process (atomicUpdateJson, audited).
  await atomicUpdateJson<ExitProcess[]>(
    PROCESSES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      if (list.some((p) => p.employeeId === employee.id)) {
        // Lost a race - keep the existing record.
        return { next: list, commitMessage: `chore(exits): no-op, process exists ${employee.id.slice(0, 8)}` }
      }
      return {
        next: [...list, process],
        commitMessage: `feat(exits): initiate exit for ${employee.id.slice(0, 8)}`,
      }
    },
    { defaultValue: loadExitProcesses() },
  )

  // 2) Flip the employee to Exited via the queue (employees.json is
  //    queue-managed; apply_queue.py already handles exit.initiate).
  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'employee',
      operation: 'update',
      payload: {
        id: employee.id,
        operation: 'exit.initiate',
        before: { status: employee.status, exit: employee.exit ?? null },
        after: {
          status: 'Exited',
          exit: {
            lastWorkingDay,
            reason: reasonForLeaving,
            relievingLetterIssued: false,
            experienceLetterIssued: false,
            notes: notes || undefined,
          },
        },
        notes: `Exit initiated by ${session.email}, LWD ${lastWorkingDay}.`,
      },
    })
  } catch (err) {
    // The process record is the source of truth for the cockpit; the roster
    // flip is queued and will retry. Surface a soft warning, not a hard fail.
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json(
      {
        ok: true,
        warning: `Exit recorded, but the roster move is delayed: ${message}`,
      },
      { status: 200 },
    )
  }

  return NextResponse.json({
    ok: true,
    note: 'Exit initiated. The roster move reflects once the queue drains (~10 minutes); the exit checklist is live now.',
  })
}
