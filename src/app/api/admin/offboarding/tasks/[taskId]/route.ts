/*
 * Update one offboarding task. Same role gating shape as the onboarding
 * route: HR/Admin always; HOD only when canUserSeeOffboardingTask passes.
 *
 *   PATCH /api/admin/offboarding/tasks/[taskId]
 *     body: { status?, notes?, blockers?, assignedTo? }
 *
 * Exit-interview task is not editable through this route; it has its
 * own /api/admin/offboarding/exit-interview route with stricter gating.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  applyOffboardingTaskStatusChange,
  canUserSeeOffboardingTask,
  loadOffboardingTasks,
  loadOffboardingTemplates,
} from '@/lib/offboardingTasks'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { OffboardingTask, TaskStatus } from '@/lib/types'
import { TASK_STATUSES } from '@/lib/types'

export const runtime = 'nodejs'

const TASKS_PATH = 'src/data/employee_offboarding_tasks.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface Body {
  status?: TaskStatus
  notes?: string
  blockers?: string
  assignedTo?: string | null
}

export async function PATCH(
  request: Request,
  { params }: { params: { taskId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)

  const taskId = params.taskId
  const tasks = loadOffboardingTasks()
  const templates = loadOffboardingTemplates()
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return bad('Task not found.', 404)

  const employee = findEmployeeById(task.employeeId)
  if (!employee) return bad('Employee for this task no longer exists.', 404)

  const tpl = templates.find((t) => t.id === task.templateId)
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'

  if (!isHrOrAdmin) {
    if (
      !canUserSeeOffboardingTask({
        task,
        template: tpl,
        user: { id: session.sub, role: session.role },
        employee,
      })
    ) {
      return bad('You can only update offboarding tasks for your own direct reports.', 403)
    }
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }

  if (body.status !== undefined && !TASK_STATUSES.includes(body.status)) {
    return bad(`status must be one of: ${TASK_STATUSES.join(', ')}.`)
  }
  if (!isHrOrAdmin) {
    if (body.assignedTo !== undefined) return bad('Only HR can reassign tasks.', 403)
    if (body.status === 'N/A') return bad('Only HR can mark a task N/A.', 403)
  }

  const now = new Date().toISOString()

  await atomicUpdateJson<OffboardingTask[]>(
    TASKS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((t) => {
        if (t.id !== taskId) return t
        let updated: OffboardingTask = t
        if (body.status !== undefined) {
          updated = applyOffboardingTaskStatusChange({
            task: updated,
            status: body.status,
            byUser: session.email,
            notes: body.notes,
            blockers: body.blockers,
            now,
          })
        } else if (body.notes !== undefined || body.blockers !== undefined) {
          updated = {
            ...updated,
            notes: body.notes ?? updated.notes,
            blockers: body.blockers ?? updated.blockers,
            auditLog: [
              ...updated.auditLog,
              {
                timestamp: now,
                user: session.email,
                action: 'offboarding.task.notes',
                before: { notes: updated.notes, blockers: updated.blockers },
                after: { notes: body.notes ?? updated.notes, blockers: body.blockers ?? updated.blockers },
              },
            ],
          }
        }
        if (body.assignedTo !== undefined && body.assignedTo !== updated.assignedTo) {
          updated = {
            ...updated,
            assignedTo: body.assignedTo,
            auditLog: [
              ...updated.auditLog,
              {
                timestamp: now,
                user: session.email,
                action: 'offboarding.task.reassign',
                before: { assignedTo: t.assignedTo },
                after: { assignedTo: body.assignedTo },
              },
            ],
          }
        }
        return updated
      })
      return {
        next,
        commitMessage: `feat(offboarding): update task ${taskId.slice(0, 18)}`,
      }
    },
    { defaultValue: [] as OffboardingTask[] },
  )

  return NextResponse.json({
    ok: true,
    note: 'Saved. The task list updates everywhere once Vercel rebuilds (~2 minutes).',
  })
}
