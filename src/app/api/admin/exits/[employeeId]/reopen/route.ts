/*
 * Reopen (undo) a closed exit, returning it to the active board. For misfire
 * correction: Admin any time, HR within EXIT_REOPEN_HR_WINDOW_MS of the close.
 *
 *   POST /api/admin/exits/[employeeId]/reopen
 *     body: { reason? }
 *
 * atomicUpdateJson + auditLog. completedAt is untouched, so a genuinely
 * complete exit stays in Alumni; a closed-incomplete one returns to In progress.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  canReopenExitProcess,
  findExitProcess,
  loadExitProcesses,
  reopenExitProcess,
} from '@/lib/exitProcess'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { ExitProcess } from '@/lib/types'

export const runtime = 'nodejs'

const PROCESSES_PATH = 'src/data/exit_processes.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(
  request: Request,
  { params }: { params: { employeeId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)

  const employee = findEmployeeById(params.employeeId)
  if (!employee) return bad('Employee not found.', 404)

  const process = findExitProcess(employee.id)
  if (!process) return bad('No exit found for this employee.', 404)
  if (!process.closedAt) return bad('This exit is not closed.', 409)

  const now = new Date().toISOString()
  if (!canReopenExitProcess(session, process, now)) {
    return bad('You cannot reopen this exit. HR can undo a close within 24 hours; Admin any time.', 403)
  }

  let body: { reason?: unknown } = {}
  try {
    body = (await request.json()) as { reason?: unknown }
  } catch {
    /* reason is optional */
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : ''

  const { next } = await atomicUpdateJson<ExitProcess[]>(
    PROCESSES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const updatedList = list.map((p) =>
        p.employeeId === employee.id ? reopenExitProcess({ process: p, by: session.email, now, reason }) : p,
      )
      return {
        next: updatedList,
        commitMessage: `feat(exits): reopen exit ${employee.id.slice(0, 8)}`,
      }
    },
    { defaultValue: loadExitProcesses() },
  )

  const result = next.find((p) => p.employeeId === employee.id)
  return NextResponse.json({ ok: true, process: result })
}
