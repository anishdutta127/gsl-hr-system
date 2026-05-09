/*
 * Attendance exception logging.
 *
 *   POST   /api/admin/attendance     - log a new exception
 *     body: { employeeId, date, type, notes? }
 *     OR   bulk: { employeeIds: string[], date, type, notes? }
 *   PATCH  /api/admin/attendance     - edit existing
 *     body: { id, type?, notes? }
 *   DELETE /api/admin/attendance?id=...
 *
 * Auth: Admin + HR. HOD/Leadership read-only via the page-level loader.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { canEditAttendance } from '@/lib/attendance'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import {
  ATTENDANCE_EXCEPTION_TYPES,
  type AttendanceException,
  type AttendanceExceptionType,
} from '@/lib/types'

export const runtime = 'nodejs'

const PATH = 'src/data/attendance_exceptions.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface PostBody {
  employeeId?: string
  employeeIds?: string[]
  date: string
  type: AttendanceExceptionType
  notes?: string
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (!canEditAttendance(session.role)) {
    return bad('Only Admin or HR can log attendance exceptions.', 403)
  }
  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return bad('Body must be JSON.')
  }
  if (!isValidDate(body.date)) return bad('date must be YYYY-MM-DD.')
  if (!ATTENDANCE_EXCEPTION_TYPES.includes(body.type)) {
    return bad(`type must be one of: ${ATTENDANCE_EXCEPTION_TYPES.join(', ')}.`)
  }
  const ids = body.employeeIds ?? (body.employeeId ? [body.employeeId] : [])
  if (ids.length === 0) return bad('employeeId or employeeIds is required.')

  const now = new Date().toISOString()
  const newOnes: AttendanceException[] = ids.map((employeeId) => ({
    id: `aex-${crypto.randomUUID()}`,
    employeeId,
    date: body.date,
    type: body.type,
    notes: body.notes ?? '',
    loggedBy: session.email,
    loggedAt: now,
    auditLog: [
      {
        timestamp: now,
        user: session.email,
        action: 'attendance.log',
        after: { employeeId, date: body.date, type: body.type },
        notes: ids.length > 1 ? `Bulk-logged across ${ids.length} employees` : undefined,
      },
    ],
  }))

  await atomicUpdateJson<AttendanceException[]>(
    PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: [...list, ...newOnes],
        commitMessage: `feat(attendance): log ${body.type} for ${ids.length} employee${ids.length === 1 ? '' : 's'} on ${body.date}`,
      }
    },
    { defaultValue: [] as AttendanceException[] },
  )

  return NextResponse.json({
    ok: true,
    count: newOnes.length,
    note: 'Logged. Reflects on the calendar once Vercel rebuilds (~2 minutes).',
  })
}

interface PatchBody {
  id: string
  type?: AttendanceExceptionType
  notes?: string
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (!canEditAttendance(session.role)) {
    return bad('Only Admin or HR can edit attendance exceptions.', 403)
  }
  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return bad('Body must be JSON.')
  }
  if (!body.id) return bad('id is required.')
  if (body.type !== undefined && !ATTENDANCE_EXCEPTION_TYPES.includes(body.type)) {
    return bad('Invalid type.')
  }

  const now = new Date().toISOString()
  let touched = false
  await atomicUpdateJson<AttendanceException[]>(
    PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((ex) => {
        if (ex.id !== body.id) return ex
        touched = true
        const before = { type: ex.type, notes: ex.notes }
        const updated: AttendanceException = {
          ...ex,
          type: body.type ?? ex.type,
          notes: body.notes ?? ex.notes,
          auditLog: [
            ...ex.auditLog,
            {
              timestamp: now,
              user: session.email,
              action: 'attendance.update',
              before,
              after: { type: body.type ?? ex.type, notes: body.notes ?? ex.notes },
            },
          ],
        }
        return updated
      })
      return {
        next,
        commitMessage: `feat(attendance): update ${body.id.slice(0, 18)}`,
      }
    },
    { defaultValue: [] as AttendanceException[] },
  )
  if (!touched) return bad('Exception not found.', 404)
  return NextResponse.json({
    ok: true,
    note: 'Saved. Reflects once Vercel rebuilds (~2 minutes).',
  })
}

export async function DELETE(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (!canEditAttendance(session.role)) {
    return bad('Only Admin or HR can delete attendance exceptions.', 403)
  }
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()
  if (!id) return bad('id is required.')
  let removed = false
  await atomicUpdateJson<AttendanceException[]>(
    PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.filter((ex) => ex.id !== id)
      removed = next.length !== list.length
      return {
        next,
        commitMessage: `feat(attendance): delete ${id.slice(0, 18)}`,
      }
    },
    { defaultValue: [] as AttendanceException[] },
  )
  if (!removed) return bad('Exception not found.', 404)
  return NextResponse.json({ ok: true })
}
