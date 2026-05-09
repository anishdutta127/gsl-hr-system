/*
 * Generate offboarding tasks for an employee. Idempotent.
 *
 *   POST /api/admin/offboarding/generate
 *     body: { employeeId, noticeStartDate?, lastWorkingDay? }
 *
 * The dates default to today and today+30 if absent. Caller is expected
 * to supply both during a real exit; the defaults exist for testing.
 *
 * Admin + HR only.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById, loadUsers } from '@/lib/data'
import {
  generateOffboardingTasksForEmployee,
  loadOffboardingTasks,
  loadOffboardingTemplates,
} from '@/lib/offboardingTasks'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { addDaysIso } from '@/lib/onboardingTasks'
import type { OffboardingTask } from '@/lib/types'

export const runtime = 'nodejs'

const TASKS_PATH = 'src/data/employee_offboarding_tasks.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface Body {
  employeeId: string
  noticeStartDate?: string
  lastWorkingDay?: string
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can generate offboarding tasks.', 403)
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }
  const employeeId = body.employeeId?.trim()
  if (!employeeId) return bad('employeeId is required.')

  const employee = findEmployeeById(employeeId)
  if (!employee) return bad('Employee not found.', 404)

  const today = new Date().toISOString().slice(0, 10)
  const noticeStartDate = body.noticeStartDate ?? today
  const lastWorkingDay = body.lastWorkingDay ?? addDaysIso(noticeStartDate, 30)

  if (lastWorkingDay <= noticeStartDate) {
    return bad('lastWorkingDay must be after noticeStartDate.')
  }

  const templates = loadOffboardingTemplates()
  const users = loadUsers()
  const existing = loadOffboardingTasks()
  const generated = generateOffboardingTasksForEmployee({
    employee,
    templates,
    users,
    existing,
    context: { noticeStartDate, lastWorkingDay },
    now: new Date(),
  })

  const alreadyMine = existing.filter((t) => t.employeeId === employee.id)
  if (alreadyMine.length > 0) {
    return NextResponse.json({
      ok: true,
      generated: 0,
      existing: alreadyMine.length,
      note: 'Offboarding tasks already exist for this employee.',
    })
  }

  await atomicUpdateJson<OffboardingTask[]>(
    TASKS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: [...list, ...generated],
        commitMessage: `feat(offboarding): generate ${generated.length} tasks for ${employee.name.slice(0, 40)} (${employee.id.slice(0, 8)})`,
      }
    },
    { defaultValue: [] as OffboardingTask[] },
  )

  return NextResponse.json({
    ok: true,
    generated: generated.length,
    note: 'Offboarding tasks queued. The checklist appears once Vercel rebuilds (~2 minutes).',
  })
}
