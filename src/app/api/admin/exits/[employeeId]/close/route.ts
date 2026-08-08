/*
 * Close (archive) an exit, moving it off the active board into Alumni even
 * with steps still outstanding. HR closes terminations / suspensions without
 * issuing every letter, so completion is NOT required.
 *
 *   POST /api/admin/exits/[employeeId]/close
 *     body: { reason }   (required when any mandatory step is outstanding)
 *
 * Legacy exits (employee already Exited, no ExitProcess yet) are closeable
 * directly: a minimal first-class record is created on the fly, then closed.
 *
 * Admin + HR only. atomicUpdateJson + auditLog. Never auto-issues letters.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  canCloseExitProcess,
  closeExitProcess,
  createExitProcessForLegacy,
  findExitProcess,
  loadExitProcesses,
  loadExitStepTemplates,
  outstandingStepNames,
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
  if (!canCloseExitProcess(session)) return bad('Only Admin or HR can close an exit.', 403)

  const employee = await findEmployeeById(params.employeeId)
  if (!employee) return bad('Employee not found.', 404)

  let body: { reason?: unknown }
  try {
    body = (await request.json()) as { reason?: unknown }
  } catch {
    return bad('Body must be JSON.')
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : ''

  const now = new Date().toISOString()
  const templates = loadExitStepTemplates()
  const existing = findExitProcess(employee.id)

  if (existing?.closedAt) return bad('This exit is already closed.', 409)

  // The record we will close: the existing process, or a fresh legacy one.
  const base = existing ?? createExitProcessForLegacy({ employee, templates, by: session.email, now })

  // Require a reason whenever closing leaves mandatory work outstanding.
  if (outstandingStepNames(base).length > 0 && !reason) {
    return bad('A short reason is required when closing an exit with steps still outstanding.', 422)
  }

  const { next } = await atomicUpdateJson<ExitProcess[]>(
    PROCESSES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((p) => p.employeeId === employee.id)
      if (idx === -1) {
        // Legacy: append the freshly-built, now-closed record.
        const closed = closeExitProcess({ process: base, reason, by: session.email, now })
        return {
          next: [...list, closed],
          commitMessage: `feat(exits): close legacy exit ${employee.id.slice(0, 8)}`,
        }
      }
      const target = list[idx]!
      if (target.closedAt) {
        // Lost a race - already closed by another write; keep it.
        return { next: list, commitMessage: `chore(exits): no-op, already closed ${employee.id.slice(0, 8)}` }
      }
      const updated = closeExitProcess({ process: target, reason, by: session.email, now })
      const nextList = [...list]
      nextList[idx] = updated
      return { next: nextList, commitMessage: `feat(exits): close exit ${employee.id.slice(0, 8)}` }
    },
    { defaultValue: loadExitProcesses() },
  )

  const result = next.find((p) => p.employeeId === employee.id)
  return NextResponse.json({
    ok: true,
    process: result,
    note: 'Exit closed and moved to Alumni. The board reflects this once Vercel rebuilds (~2 minutes).',
  })
}
