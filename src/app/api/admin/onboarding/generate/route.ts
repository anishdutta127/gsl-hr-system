/*
 * Generate onboarding tasks for an employee. Idempotent — re-running
 * returns the existing list rather than duplicating. Used both by the
 * employee creation flow (auto-generated when an employee is added) and
 * for retroactive activation of onboarding for existing employees who
 * joined within the 6-month window.
 *
 *   POST /api/admin/onboarding/generate
 *     body: { employeeId }
 *
 * Admin + HR only. The reporting manager kicks off their own visibility
 * via /employees/[id]/onboarding once tasks are generated; they never
 * trigger generation themselves.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById, loadUsers } from '@/lib/data'
import {
  generateOnboardingTasksForEmployee,
  loadOnboardingTasks,
  loadOnboardingTemplates,
} from '@/lib/onboardingTasks'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { OnboardingTask } from '@/lib/types'

export const runtime = 'nodejs'

const TASKS_PATH = 'src/data/employee_onboarding_tasks.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface Body {
  employeeId: string
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can generate onboarding tasks.', 403)
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

  const templates = loadOnboardingTemplates()
  const users = loadUsers()
  const existing = loadOnboardingTasks()
  const generated = generateOnboardingTasksForEmployee({
    employee,
    templates,
    users,
    existing,
    now: new Date(),
  })

  if (generated.length === 0) {
    return NextResponse.json({
      ok: true,
      generated: 0,
      note: employee.dateOfJoining
        ? 'No tasks generated — employee is past the 6-month onboarding window.'
        : 'No tasks generated — employee has no joining date.',
    })
  }

  const alreadyMine = existing.filter((t) => t.employeeId === employee.id)
  if (alreadyMine.length > 0) {
    return NextResponse.json({
      ok: true,
      generated: 0,
      existing: alreadyMine.length,
      note: 'Tasks already exist for this employee. Open /employees/[id]/onboarding to manage them.',
    })
  }

  await atomicUpdateJson<OnboardingTask[]>(
    TASKS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: [...list, ...generated],
        commitMessage: `feat(onboarding): generate ${generated.length} tasks for ${employee.name.slice(0, 40)} (${employee.id.slice(0, 8)})`,
      }
    },
    { defaultValue: [] as OnboardingTask[] },
  )

  return NextResponse.json({
    ok: true,
    generated: generated.length,
    note: 'Tasks queued. The checklist appears once Vercel rebuilds (~2 minutes).',
  })
}
