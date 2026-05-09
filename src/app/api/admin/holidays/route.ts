/*
 * Holiday calendar mutations. Admin + HR.
 *
 *   POST   /api/admin/holidays           - create holiday
 *   PATCH  /api/admin/holidays           - update existing (body has id)
 *   DELETE /api/admin/holidays?id=...    - delete holiday
 *
 * Writes go directly via atomicUpdateJson on src/data/holidays.json. The
 * holiday calendar is small (~15 entries/year) and changes rarely, so the
 * extra commit per edit is fine — each one triggers a normal Vercel
 * rebuild that surfaces the new calendar.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { Holiday, HolidayType } from '@/lib/types'

export const runtime = 'nodejs'

const HOLIDAYS_PATH = 'src/data/holidays.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface CreateBody {
  date: string
  name: string
  type: HolidayType
  regions?: string[]
  notes?: string
}
interface UpdateBody {
  id: string
  date?: string
  name?: string
  type?: HolidayType
  regions?: string[]
  notes?: string | null
}

async function requireHrOrAdmin() {
  const session = await getCurrentSession()
  if (!session) return { error: bad('Not signed in.', 401) }
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return { error: bad('Only Admin or HR can manage the holiday calendar.', 403) }
  }
  return { session }
}

function validateDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())
}

export async function POST(request: Request) {
  const auth = await requireHrOrAdmin()
  if ('error' in auth) return auth.error
  const { session } = auth

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return bad('Body must be JSON.')
  }

  const date = body.date?.trim()
  const name = body.name?.trim()
  if (!date || !validateDate(date)) return bad('date must be YYYY-MM-DD.')
  if (!name) return bad('name is required.')
  if (body.type !== 'mandatory' && body.type !== 'optional')
    return bad('type must be mandatory or optional.')

  const now = new Date().toISOString()
  const id = `h-${date}-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)}-${crypto.randomBytes(2).toString('hex')}`

  const newHoliday: Holiday = {
    id,
    date,
    name,
    type: body.type,
    regions: body.regions ?? ['national'],
    notes: body.notes,
    createdAt: now,
    createdBy: session.email,
    auditLog: [
      {
        timestamp: now,
        user: session.email,
        action: 'holiday.create',
        after: { date, name, type: body.type },
      },
    ],
  }

  await atomicUpdateJson<Holiday[]>(
    HOLIDAYS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: [...list, newHoliday],
        commitMessage: `feat(holidays): add ${name} (${date})`,
      }
    },
    { defaultValue: [] as Holiday[] },
  )

  return NextResponse.json({ ok: true, holiday: newHoliday })
}

export async function PATCH(request: Request) {
  const auth = await requireHrOrAdmin()
  if ('error' in auth) return auth.error
  const { session } = auth

  let body: UpdateBody
  try {
    body = (await request.json()) as UpdateBody
  } catch {
    return bad('Body must be JSON.')
  }

  const id = body.id?.trim()
  if (!id) return bad('id is required.')
  if (body.date !== undefined && !validateDate(body.date))
    return bad('date must be YYYY-MM-DD.')
  if (body.type !== undefined && body.type !== 'mandatory' && body.type !== 'optional')
    return bad('type must be mandatory or optional.')

  const now = new Date().toISOString()
  let touched = false

  await atomicUpdateJson<Holiday[]>(
    HOLIDAYS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((h) => {
        if (h.id !== id) return h
        touched = true
        const before: Partial<Holiday> = {
          date: h.date,
          name: h.name,
          type: h.type,
          notes: h.notes,
          regions: h.regions,
        }
        const after: Holiday = {
          ...h,
          date: body.date ?? h.date,
          name: body.name ?? h.name,
          type: body.type ?? h.type,
          regions: body.regions ?? h.regions,
          notes: body.notes === null ? undefined : body.notes ?? h.notes,
          auditLog: [
            ...h.auditLog,
            {
              timestamp: now,
              user: session.email,
              action: 'holiday.update',
              before,
              after: {
                date: body.date ?? h.date,
                name: body.name ?? h.name,
                type: body.type ?? h.type,
                notes: body.notes === null ? undefined : body.notes ?? h.notes,
              },
            },
          ],
        }
        return after
      })
      return {
        next,
        commitMessage: `feat(holidays): update ${id}`,
      }
    },
    { defaultValue: [] as Holiday[] },
  )

  if (!touched) return bad('Holiday not found.', 404)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const auth = await requireHrOrAdmin()
  if ('error' in auth) return auth.error

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()
  if (!id) return bad('id is required.')

  let removed: Holiday | null = null
  await atomicUpdateJson<Holiday[]>(
    HOLIDAYS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      removed = list.find((h) => h.id === id) ?? null
      return {
        next: list.filter((h) => h.id !== id),
        commitMessage: `feat(holidays): delete ${removed?.name ?? id}`,
      }
    },
    { defaultValue: [] as Holiday[] },
  )

  if (!removed) return bad('Holiday not found.', 404)
  return NextResponse.json({ ok: true })
}
