/*
 * Update one onboarding task: status, notes, blockers, assignedTo.
 *
 *   PATCH /api/admin/onboarding/tasks/[taskId]
 *     body: { status?, notes?, blockers?, assignedTo? }
 *
 * Permission: Admin + HR can update any task. HOD-class users (Reporting
 * Managers) can update tasks where they are the assignee OR they are the
 * employee's reporting manager. canUserSeeTask gates both.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  applyTaskStatusChange,
  canUserSeeTask,
  loadOnboardingTasks,
} from '@/lib/onboardingTasks'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { OnboardingTask, TaskStatus } from '@/lib/types'
import { TASK_STATUSES } from '@/lib/types'

export const runtime = 'nodejs'

const TASKS_PATH = 'src/data/employee_onboarding_tasks.json'

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
  const tasks = loadOnboardingTasks()
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return bad('Task not found.', 404)

  const employee = await findEmployeeById(task.employeeId)
  if (!employee) return bad('Employee for this task no longer exists.', 404)

  // Permission: HR/Admin always; HOD only when canUserSeeTask says yes.
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  if (!isHrOrAdmin) {
    if (
      !canUserSeeTask({
        task,
        user: { id: session.sub, role: session.role },
        employee,
      })
    ) {
      return bad('You can only update tasks for your own direct reports.', 403)
    }
    // HOD can mark complete / blocked / in-progress on their tasks but
    // cannot reassign or mark N/A — those are HR moves.
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

  await atomicUpdateJson<OnboardingTask[]>(
    TASKS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((t) => {
        if (t.id !== taskId) return t
        let updated: OnboardingTask = t
        if (body.status !== undefined) {
          updated = applyTaskStatusChange({
            task: updated,
            status: body.status,
            byUser: session.email,
            notes: body.notes,
            blockers: body.blockers,
            now,
          })
        } else if (body.notes !== undefined || body.blockers !== undefined) {
          // Editing notes/blockers without status change still appends an
          // audit entry so the change isn't silent.
          updated = {
            ...updated,
            notes: body.notes ?? updated.notes,
            blockers: body.blockers ?? updated.blockers,
            auditLog: [
              ...updated.auditLog,
              {
                timestamp: now,
                user: session.email,
                action: 'onboarding.task.notes',
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
                action: 'onboarding.task.reassign',
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
        commitMessage: `feat(onboarding): update task ${taskId.slice(0, 18)}`,
      }
    },
    { defaultValue: [] as OnboardingTask[] },
  )

  return NextResponse.json({
    ok: true,
    note: 'Saved. The task list updates everywhere once Vercel rebuilds (~2 minutes).',
  })
}
