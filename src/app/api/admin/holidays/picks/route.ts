/*
 * Per-employee optional holiday picks. Toggle endpoint only.
 *
 *   POST /api/admin/holidays/picks
 *     body: { employeeId, holidayId, year }
 *
 * Adds the pick if absent (subject to the 2/year budget) or removes it
 * if present. Admin + HR can toggle on behalf of any employee. Self-
 * service toggles for the candidate / employee themselves land in Phase 3.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { togglePick } from '@/lib/holidays'
import type { EmployeeOptionalHoliday } from '@/lib/types'

export const runtime = 'nodejs'

const PICKS_PATH = 'src/data/employee_optional_holidays.json'

interface Body {
  employeeId: string
  holidayId: string
  year: number
}

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can manage holiday picks.', 403)
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }

  const employeeId = body.employeeId?.trim()
  const holidayId = body.holidayId?.trim()
  const year = Number(body.year)
  if (!employeeId || !holidayId) return bad('employeeId and holidayId are required.')
  if (!Number.isFinite(year) || year < 2020 || year > 2100) return bad('year is out of range.')

  const now = new Date().toISOString()
  let action: 'added' | 'removed' = 'added'

  try {
    await atomicUpdateJson<EmployeeOptionalHoliday[]>(
      PICKS_PATH,
      (current) => {
        const list = Array.isArray(current) ? current : []
        const result = togglePick({
          picks: list,
          employeeId,
          holidayId,
          year,
          selectedBy: session.email,
          now,
        })
        action = result.action
        return {
          next: result.next,
          commitMessage: `feat(holidays): ${result.action} pick ${holidayId} for ${employeeId}`,
        }
      },
      { defaultValue: [] as EmployeeOptionalHoliday[] },
    )
  } catch (err) {
    if (err instanceof Error && err.message.includes('budget')) {
      return bad(err.message, 409)
    }
    throw err
  }

  return NextResponse.json({ ok: true, action })
}
