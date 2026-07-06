/*
 * Update or delete an internal HR task.
 *
 *   PATCH  /api/hr-tasks/[id]
 *     - field patch: { title?, description?, status?, ownerUserId?,
 *         dependency?, blocked?, blockerNote?, dueDate?, nextStep? }
 *     - stage ops: { action: 'advance-stage' }
 *                  { action: 'add-stage', stageName }
 *                  { action: 'update-stage', stageId, stageName?, stageNotes?, stageStatus? }
 *                  { action: 'remove-stage', stageId }
 *   DELETE /api/hr-tasks/[id]   (Admin only)
 *
 * Admin + HR edit; atomicUpdateJson + auditLog.
 */

import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import {
  advanceStage,
  applyHrTaskUpdate,
  canEditHrTasks,
  loadHrTasks,
  type HrTaskPatch,
} from '@/lib/hrTasks'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import {
  HR_TASK_STAGE_STATUSES,
  HR_TASK_STATUSES,
  type HrTask,
  type HrTaskStage,
  type HrTaskStageStatus,
  type HrTaskStatus,
} from '@/lib/types'

export const runtime = 'nodejs'

const FILE_PATH = 'src/data/hr_tasks.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

function buildPatch(body: Record<string, unknown>): HrTaskPatch {
  const patch: HrTaskPatch = {}
  if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 200)
  if (typeof body.description === 'string') patch.description = body.description.slice(0, 5000)
  if (typeof body.status === 'string' && HR_TASK_STATUSES.includes(body.status as HrTaskStatus)) {
    patch.status = body.status as HrTaskStatus
  }
  if ('ownerUserId' in body) patch.ownerUserId = typeof body.ownerUserId === 'string' && body.ownerUserId ? body.ownerUserId : null
  if ('dependency' in body) {
    const d = body.dependency
    patch.dependency =
      d && typeof d === 'object'
        ? {
            pendingWith: String((d as Record<string, unknown>).pendingWith ?? '').slice(0, 200),
            pendingWithUserId:
              typeof (d as Record<string, unknown>).pendingWithUserId === 'string'
                ? ((d as Record<string, unknown>).pendingWithUserId as string)
                : null,
            reason: String((d as Record<string, unknown>).reason ?? '').slice(0, 1000),
          }
        : null
  }
  if ('blocked' in body) patch.blocked = Boolean(body.blocked)
  if (typeof body.blockerNote === 'string') patch.blockerNote = body.blockerNote.slice(0, 1000)
  if ('dueDate' in body) patch.dueDate = typeof body.dueDate === 'string' && body.dueDate ? body.dueDate : null
  if ('nextStep' in body) patch.nextStep = typeof body.nextStep === 'string' && body.nextStep.trim() ? body.nextStep.trim().slice(0, 1000) : null
  return patch
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (!canEditHrTasks(session)) return bad('Only Admin or HR can update tasks.', 403)

  const existing = loadHrTasks().find((t) => t.id === params.id)
  if (!existing) return bad('Task not found.', 404)

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return bad('Body must be JSON.')
  }

  const action = typeof body.action === 'string' ? body.action : null
  const now = new Date().toISOString()

  function mutate(task: HrTask): HrTask {
    if (action === 'advance-stage') {
      return advanceStage(task, session!.email, now)
    }
    if (action === 'add-stage') {
      const name = typeof body.stageName === 'string' ? body.stageName.trim().slice(0, 160) : ''
      if (!name) return task
      const order = task.stages.reduce((m, s) => Math.max(m, s.order), 0) + 1
      const stage: HrTaskStage = { id: `stg-${randomUUID().slice(0, 8)}`, name, order, status: 'pending' }
      return {
        ...task,
        stages: [...task.stages, stage],
        updatedAt: now,
        auditLog: [...task.auditLog, { timestamp: now, user: session!.email, action: 'hr-task.add-stage', after: { name } }],
      }
    }
    if (action === 'update-stage') {
      const stageId = typeof body.stageId === 'string' ? body.stageId : ''
      const stageStatus =
        typeof body.stageStatus === 'string' && HR_TASK_STAGE_STATUSES.includes(body.stageStatus as HrTaskStageStatus)
          ? (body.stageStatus as HrTaskStageStatus)
          : undefined
      return {
        ...task,
        stages: task.stages.map((s) =>
          s.id === stageId
            ? {
                ...s,
                name: typeof body.stageName === 'string' ? body.stageName.slice(0, 160) : s.name,
                notes: typeof body.stageNotes === 'string' ? body.stageNotes.slice(0, 1000) : s.notes,
                status: stageStatus ?? s.status,
              }
            : s,
        ),
        currentStageId: stageStatus === 'current' ? stageId : task.currentStageId,
        updatedAt: now,
        auditLog: [...task.auditLog, { timestamp: now, user: session!.email, action: 'hr-task.update-stage', after: { stageId } }],
      }
    }
    if (action === 'remove-stage') {
      const stageId = typeof body.stageId === 'string' ? body.stageId : ''
      return {
        ...task,
        stages: task.stages.filter((s) => s.id !== stageId),
        currentStageId: task.currentStageId === stageId ? null : task.currentStageId,
        updatedAt: now,
        auditLog: [...task.auditLog, { timestamp: now, user: session!.email, action: 'hr-task.remove-stage', before: { stageId } }],
      }
    }
    return applyHrTaskUpdate({ task, patch: buildPatch(body), by: session!.email, now })
  }

  const { next } = await atomicUpdateJson<HrTask[]>(
    FILE_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: list.map((t) => (t.id === params.id ? mutate(t) : t)),
        commitMessage: `feat(hr-tasks): ${action ?? 'update'} ${params.id.slice(0, 18)}`,
      }
    },
    { defaultValue: loadHrTasks() },
  )

  return NextResponse.json({
    ok: true,
    task: next.find((t) => t.id === params.id),
    note: 'Saved. The board reflects this once Vercel rebuilds (~2 minutes).',
  })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin') return bad('Only Admin can delete tasks.', 403)

  const existing = loadHrTasks().find((t) => t.id === params.id)
  if (!existing) return bad('Task not found.', 404)

  await atomicUpdateJson<HrTask[]>(
    FILE_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: list.filter((t) => t.id !== params.id),
        commitMessage: `feat(hr-tasks): delete task ${params.id.slice(0, 18)}`,
      }
    },
    { defaultValue: loadHrTasks() },
  )

  return NextResponse.json({ ok: true })
}
