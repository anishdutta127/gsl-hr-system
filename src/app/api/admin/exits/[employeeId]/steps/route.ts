/*
 * Add a custom step to an exit process. Lets HR extend the default six-step
 * checklist per employee (the editable-templates promise). Custom steps are
 * non-mandatory and removable.
 *
 *   POST /api/admin/exits/[employeeId]/steps
 *     body: { name }
 *
 * Admin + HR only. atomicUpdateJson + auditLog.
 */

import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { canEditExitProcess, loadExitProcesses } from '@/lib/exitProcess'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { ExitProcess, ExitProcessStep } from '@/lib/types'

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
  if (!canEditExitProcess(session)) return bad('Only Admin or HR can add an exit step.', 403)

  const process = loadExitProcesses().find((p) => p.employeeId === params.employeeId)
  if (!process) return bad('No exit in progress for this employee.', 404)

  let body: { name?: unknown }
  try {
    body = (await request.json()) as { name?: unknown }
  } catch {
    return bad('Body must be JSON.')
  }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
  if (!name) return bad('Step name is required.')

  const step: ExitProcessStep = {
    templateId: `custom-${randomUUID().slice(0, 8)}`,
    name,
    kind: 'custom',
    isMandatory: false,
    status: 'Not Started',
    data: {},
    notes: '',
    completedAt: null,
    completedBy: null,
  }

  const now = new Date().toISOString()
  await atomicUpdateJson<ExitProcess[]>(
    PROCESSES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const updatedList = list.map((p) => {
        if (p.employeeId !== params.employeeId) return p
        return {
          ...p,
          steps: [...p.steps, step],
          updatedAt: now,
          auditLog: [
            ...p.auditLog,
            {
              timestamp: now,
              user: session.email,
              action: 'exit.step.add-custom',
              after: { templateId: step.templateId, name },
            },
          ],
        }
      })
      return {
        next: updatedList,
        commitMessage: `feat(exits): add custom step ${params.employeeId.slice(0, 8)}`,
      }
    },
    { defaultValue: loadExitProcesses() },
  )

  return NextResponse.json({ ok: true, step })
}
