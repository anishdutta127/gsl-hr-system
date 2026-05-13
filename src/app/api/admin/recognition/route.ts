/*
 * Recognition nomination API. Mirrors the taxonomy / nominations pattern:
 * single POST endpoint that creates a Recognition record with
 * status='Nominated' via atomicUpdateJson.
 *
 * Auth:
 *   Admin + HR may nominate any active employee.
 *   HOD may nominate only employees in their own department (department
 *   resolved by matching the HOD's email to an employee record).
 *   Leadership cannot nominate.
 *
 * Side effect: best-effort email to all active Admin + HR users so they
 * know a new nomination is waiting for review. Failures are swallowed so a
 * mail-server hiccup does not roll back the nomination.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees, loadRecognitions, loadUsers } from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { deliverEmail } from '@/lib/mail'
import {
  financialYearStart,
  nextRecognitionId,
} from '@/lib/recognition'
import {
  canNominateEmployee,
  canTransition,
  validateWriteup,
} from '@/lib/recognitionState'
import {
  RECOGNITION_CATEGORIES,
  type Recognition,
  type RecognitionCategory,
} from '@/lib/types'

export const runtime = 'nodejs'

const RECOGNITIONS_PATH = 'src/data/recognitions.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)

  // Role gate via the pure state helper. Mirrors the canTransition contract.
  const transition = canTransition({
    current: 'Draft',
    action: 'nominate',
    actorRole: session.role,
  })
  if (!transition.ok) {
    return bad(transition.reason ?? 'Forbidden.', 403)
  }

  let body: {
    employeeId?: unknown
    category?: unknown
    month?: unknown
    writeup?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return bad('Body must be JSON.')
  }

  const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : ''
  const category = typeof body.category === 'string' ? body.category : ''
  const month = typeof body.month === 'string' ? body.month.trim() : ''
  const writeup = typeof body.writeup === 'string' ? body.writeup : ''

  if (!employeeId) return bad('employeeId is required.')
  if (!RECOGNITION_CATEGORIES.includes(category as RecognitionCategory)) {
    return bad('category must be one of the allowed RECOGNITION_CATEGORIES.')
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return bad('month must be YYYY-MM.')
  }
  const writeupError = validateWriteup(writeup)
  if (writeupError) return bad(writeupError)

  // Look up the employee + matching user record (employees + users share
  // emails since the muster migration).
  const employees = loadEmployees()
  const users = loadUsers()
  // employeeId may come from either the User.id or the Employee.id; we try
  // user first (matches the dropdown shape from NominateForm), then fall back
  // to a direct employee id lookup for HR/Admin who might paste an emp id.
  const user = users.find((u) => u.id === employeeId)
  const employee = user
    ? employees.find((e) => e.email.toLowerCase() === user.email.toLowerCase())
    : employees.find((e) => e.id === employeeId)

  if (!employee) {
    return bad('Could not find an employee for that id.', 404)
  }
  if (employee.status !== 'Active') {
    return bad('Recognitions can only be nominated for Active employees.', 400)
  }

  // HOD department gate.
  let actorDepartment: string | undefined
  if (session.role === 'HOD') {
    const actorEmployee = employees.find(
      (e) => e.email.toLowerCase() === session.email.toLowerCase(),
    )
    actorDepartment = actorEmployee?.department
  }
  if (
    !canNominateEmployee({
      actorRole: session.role,
      actorDepartment,
      employeeDepartment: employee.department,
    })
  ) {
    return bad(
      `HODs may only nominate employees in their own department (${actorDepartment ?? 'unknown'}).`,
      403,
    )
  }

  const now = new Date().toISOString()
  const fy = financialYearStart(now)

  let created: Recognition | null = null
  try {
    const { next } = await atomicUpdateJson<Recognition[]>(
      RECOGNITIONS_PATH,
      (current) => {
        const list = Array.isArray(current) ? current : []
        const id = nextRecognitionId(list, fy)
        const rec: Recognition = {
          id,
          employeeId: user?.id ?? employee.id,
          nominatedBy: session.sub,
          month,
          department: employee.department,
          category: category as RecognitionCategory,
          writeup: writeup.trim(),
          status: 'Nominated',
          nominatedAt: now,
          distributionEmails: [],
          auditLog: [
            {
              timestamp: now,
              user: session.email,
              action: 'recognition.nominate',
              after: {
                employeeId: user?.id ?? employee.id,
                month,
                category,
                department: employee.department,
              },
              notes: `Nominated by ${session.role} for ${employee.name} (${employee.department}).`,
            },
          ],
        }
        created = rec
        return {
          next: [...list, rec],
          commitMessage: `feat(recognition): nominate ${employee.name} (${id})`,
        }
      },
      { defaultValue: loadRecognitions() },
    )
    // Best-effort sanity check: created should now be the last entry of next.
    if (!created && next.length > 0) {
      created = next[next.length - 1] ?? null
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  // Notify Admin + HR. Best-effort; we don't wait or roll back on failure.
  const reviewers = users
    .filter((u) => u.active && (u.role === 'Admin' || u.role === 'HR'))
    .map((u) => u.email)
  if (reviewers.length > 0 && created) {
    const rec = created as Recognition
    const subject = `Nomination submitted: ${employee.name} - ${rec.category}`
    const lines = [
      `A new recognition nomination is awaiting review.`,
      '',
      `Employee: ${employee.name}`,
      `Department: ${employee.department}`,
      `Category: ${rec.category}`,
      `Month: ${month}`,
      `Nominated by: ${session.email}`,
      '',
      `Open /admin/recognition to review and approve.`,
    ]
    void deliverEmail({
      to: reviewers.join(','),
      subject,
      body: lines.join('\n'),
      context: `recognition nomination ${rec.id}`,
    })
  }

  return NextResponse.json({ ok: true, recognitionId: created?.id })
}
