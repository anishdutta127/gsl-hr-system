/*
 * Update or remove one step of an exit process.
 *
 *   PATCH  /api/admin/exits/[employeeId]/steps/[templateId]
 *     body: { status?, notes?, data? }   (data keys are whitelisted by kind)
 *   DELETE /api/admin/exits/[employeeId]/steps/[templateId]
 *     custom steps only - default steps are skipped via status 'N/A'.
 *
 * Admin + HR only (financial steps included). atomicUpdateJson + auditLog.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import {
  applyStepPatch,
  canEditExitProcess,
  loadExitProcesses,
  stepActionLabel,
  type StepPatch,
} from '@/lib/exitProcess'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import {
  EXIT_STEP_STATUSES,
  type ExitProcess,
  type ExitStepData,
  type ExitStepStatus,
} from '@/lib/types'

export const runtime = 'nodejs'

const PROCESSES_PATH = 'src/data/exit_processes.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

const ALLOWED_DATA_KEYS: (keyof ExitStepData)[] = [
  'handoverEmailedAt',
  'rmConfirmedAt',
  'settlementFigures',
  'settlementWords',
  'lastDrawnSalary',
  'pendingItems',
  'signed',
  'signedAt',
  'signedCopyNote',
  'ffAmount',
  'paymentDate',
  'paymentReference',
  'letterIssuedAt',
  'letterIssuedBy',
]

function pickData(raw: unknown): Partial<ExitStepData> {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const out: Partial<ExitStepData> = {}
  for (const k of ALLOWED_DATA_KEYS) {
    if (k in src) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(out as any)[k] = src[k]
    }
  }
  return out
}

export async function PATCH(
  request: Request,
  { params }: { params: { employeeId: string; templateId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (!canEditExitProcess(session)) return bad('Only Admin or HR can update an exit step.', 403)

  const process = loadExitProcesses().find((p) => p.employeeId === params.employeeId)
  if (!process) return bad('No exit in progress for this employee.', 404)
  const step = process.steps.find((s) => s.templateId === params.templateId)
  if (!step) return bad('Step not found.', 404)

  let body: { status?: unknown; notes?: unknown; data?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return bad('Body must be JSON.')
  }

  if (body.status !== undefined && !EXIT_STEP_STATUSES.includes(body.status as ExitStepStatus)) {
    return bad(`status must be one of: ${EXIT_STEP_STATUSES.join(', ')}.`)
  }

  const patch: StepPatch = {
    status: body.status as ExitStepStatus | undefined,
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 5000) : undefined,
    data: pickData(body.data),
  }

  const now = new Date().toISOString()
  const { next } = await atomicUpdateJson<ExitProcess[]>(
    PROCESSES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const updatedList = list.map((p) =>
        p.employeeId === params.employeeId
          ? applyStepPatch({
              process: p,
              templateId: params.templateId,
              patch,
              by: session.email,
              now,
              action: `exit.${stepActionLabel(step.kind)}.update`,
            })
          : p,
      )
      return {
        next: updatedList,
        commitMessage: `feat(exits): ${stepActionLabel(step.kind)} update ${params.employeeId.slice(0, 8)}`,
      }
    },
    { defaultValue: loadExitProcesses() },
  )

  const updated = next.find((p) => p.employeeId === params.employeeId)
  return NextResponse.json({
    ok: true,
    process: updated,
    note: 'Saved. The exit board reflects this once Vercel rebuilds (~2 minutes).',
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { employeeId: string; templateId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (!canEditExitProcess(session)) return bad('Only Admin or HR can remove an exit step.', 403)
  if (!params.templateId.startsWith('custom-')) {
    return bad('Only custom steps can be removed. Mark a default step N/A to skip it.', 400)
  }

  const process = loadExitProcesses().find((p) => p.employeeId === params.employeeId)
  if (!process) return bad('No exit in progress for this employee.', 404)
  if (!process.steps.some((s) => s.templateId === params.templateId)) return bad('Step not found.', 404)

  const now = new Date().toISOString()
  await atomicUpdateJson<ExitProcess[]>(
    PROCESSES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const updatedList = list.map((p) => {
        if (p.employeeId !== params.employeeId) return p
        return {
          ...p,
          steps: p.steps.filter((s) => s.templateId !== params.templateId),
          updatedAt: now,
          auditLog: [
            ...p.auditLog,
            {
              timestamp: now,
              user: session.email,
              action: 'exit.step.remove',
              before: { templateId: params.templateId },
            },
          ],
        }
      })
      return {
        next: updatedList,
        commitMessage: `feat(exits): remove custom step ${params.employeeId.slice(0, 8)}`,
      }
    },
    { defaultValue: loadExitProcesses() },
  )

  return NextResponse.json({ ok: true })
}
