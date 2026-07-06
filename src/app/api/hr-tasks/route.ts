/*
 * Create an internal HR task.
 *
 *   POST /api/hr-tasks
 *     body: { title, description?, ownerUserId?, dueDate?, nextStep?,
 *             status?, stageNames?: string[], dependency?, blockerNote? }
 *
 * Admin + HR only. atomicUpdateJson + auditLog.
 */

import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { canEditHrTasks, loadHrTasks } from '@/lib/hrTasks'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import {
  HR_TASK_STATUSES,
  type HrTask,
  type HrTaskStage,
  type HrTaskStatus,
} from '@/lib/types'

export const runtime = 'nodejs'

const FILE_PATH = 'src/data/hr_tasks.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (!canEditHrTasks(session)) return bad('Only Admin or HR can create tasks.', 403)

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return bad('Body must be JSON.')
  }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!title) return bad('Title is required.')

  const status = (typeof body.status === 'string' && HR_TASK_STATUSES.includes(body.status as HrTaskStatus)
    ? body.status
    : 'Not started') as HrTaskStatus

  const stageNames = Array.isArray(body.stageNames)
    ? body.stageNames.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim().slice(0, 160))
    : []

  const stages: HrTaskStage[] = stageNames.map((name, i) => ({
    id: `stg-${randomUUID().slice(0, 8)}`,
    name,
    order: i + 1,
    status: i === 0 ? 'current' : 'pending',
  }))

  const now = new Date().toISOString()
  const task: HrTask = {
    id: `hrtask-${randomUUID()}`,
    title,
    description: typeof body.description === 'string' ? body.description.slice(0, 5000) : '',
    status,
    ownerUserId: typeof body.ownerUserId === 'string' && body.ownerUserId ? body.ownerUserId : null,
    stages,
    currentStageId: stages[0]?.id ?? null,
    dependency:
      body.dependency && typeof body.dependency === 'object'
        ? {
            pendingWith: String((body.dependency as Record<string, unknown>).pendingWith ?? '').slice(0, 200),
            pendingWithUserId:
              typeof (body.dependency as Record<string, unknown>).pendingWithUserId === 'string'
                ? ((body.dependency as Record<string, unknown>).pendingWithUserId as string)
                : null,
            reason: String((body.dependency as Record<string, unknown>).reason ?? '').slice(0, 1000),
          }
        : null,
    blocked: Boolean(body.blocked),
    blockerNote: typeof body.blockerNote === 'string' ? body.blockerNote.slice(0, 1000) : '',
    dueDate: typeof body.dueDate === 'string' && body.dueDate ? body.dueDate : null,
    nextStep: typeof body.nextStep === 'string' && body.nextStep.trim() ? body.nextStep.trim().slice(0, 1000) : null,
    createdAt: now,
    createdBy: session.email,
    updatedAt: now,
    auditLog: [
      {
        timestamp: now,
        user: session.email,
        action: 'hr-task.create',
        after: { title, status },
      },
    ],
  }

  await atomicUpdateJson<HrTask[]>(
    FILE_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: [...list, task],
        commitMessage: `feat(hr-tasks): create task ${task.id.slice(0, 18)}`,
      }
    },
    { defaultValue: loadHrTasks() },
  )

  return NextResponse.json({ ok: true, task })
}
