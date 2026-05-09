/*
 * Employee profile edit. Admin + HR can update HR-Ops fields. Salary,
 * compensation, recruitment-side joins, and exit data are out of scope —
 * those go through their dedicated routes (salary-structure, exit, etc.)
 *
 *   PATCH /api/employees/[id]/profile
 *     body: { title?, phone?, location?, workPattern?, reportingTo?,
 *             address?, personalEmail?, gender?, maritalStatus? }
 *
 * Goes through the queue as employee.update with operation =
 * employee.profile.update. apply_queue.py whitelists which fields land.
 *
 * The reportingTo string is matched against existing employee names to
 * derive reportingManagerId; an unmatched manager name results in
 * reportingManagerId: null with a clear note in the audit log.
 */

import { NextResponse } from 'next/server'
import { findEmployeeById, loadEmployees } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { resolveReportingManagerId, cleanString } from '@/lib/employees/standardise'
import { inferLocationType } from '@/lib/employees/standardise'
import { WORK_PATTERNS, type WorkPattern } from '@/lib/types'

export const runtime = 'nodejs'

interface PatchBody {
  title?: string | null
  phone?: string | null
  location?: string
  workPattern?: WorkPattern
  reportingTo?: string | null
  address?: string | null
  personalEmail?: string | null
  gender?: string | null
  maritalStatus?: string | null
}

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can edit employee profiles.', 403)
  }

  const employee = findEmployeeById(params.id)
  if (!employee) return bad('Employee not found.', 404)

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return bad('Body must be JSON.')
  }

  if (body.workPattern !== undefined && !WORK_PATTERNS.includes(body.workPattern)) {
    return bad(`workPattern must be one of: ${WORK_PATTERNS.join(', ')}.`)
  }

  // If reportingTo changed, resolve the matching manager id.
  let reportingManagerId: string | null | undefined = undefined
  if (body.reportingTo !== undefined) {
    if (!body.reportingTo || !cleanString(body.reportingTo)) {
      reportingManagerId = null
    } else {
      const lookup = new Map<string, string>()
      for (const e of loadEmployees()) {
        if (e.id === employee.id) continue
        const cleanName = cleanString(e.name).toLowerCase()
        if (cleanName) lookup.set(cleanName, e.id)
      }
      reportingManagerId = resolveReportingManagerId(body.reportingTo, lookup)
    }
  }

  // Project the changed fields. Skip a key when the patch didn't touch it
  // so the audit "after" object is honest about what changed.
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  function track<T>(key: keyof PatchBody, current: T | null | undefined, next: T | null | undefined) {
    if ((next ?? null) === (current ?? null)) return
    before[key as string] = current ?? null
    after[key as string] = next ?? null
  }

  if (body.title !== undefined) track('title', employee.title, body.title)
  if (body.phone !== undefined) track('phone', employee.phone, body.phone)
  if (body.address !== undefined) track('address', employee.address, body.address)
  if (body.personalEmail !== undefined)
    track('personalEmail', employee.personalEmail, body.personalEmail)
  if (body.gender !== undefined) track('gender', employee.gender, body.gender)
  if (body.maritalStatus !== undefined)
    track('maritalStatus', employee.maritalStatus, body.maritalStatus)
  if (body.workPattern !== undefined && body.workPattern !== employee.workPattern) {
    before.workPattern = employee.workPattern ?? null
    after.workPattern = body.workPattern
  }
  if (body.location !== undefined && cleanString(body.location) !== employee.location) {
    before.location = employee.location ?? null
    after.location = cleanString(body.location)
    after.locationType = inferLocationType(cleanString(body.location))
  }
  if (body.reportingTo !== undefined) {
    const cleanedRT = body.reportingTo ? cleanString(body.reportingTo) : null
    if (cleanedRT !== (employee.reportingTo ?? null)) {
      before.reportingTo = employee.reportingTo ?? null
      after.reportingTo = cleanedRT
    }
    if (reportingManagerId !== employee.reportingManagerId) {
      before.reportingManagerId = employee.reportingManagerId ?? null
      after.reportingManagerId = reportingManagerId ?? null
    }
  }

  if (Object.keys(after).length === 0) {
    return NextResponse.json({ ok: true, changed: 0, note: 'No fields changed.' })
  }

  const note =
    reportingManagerId === null && body.reportingTo
      ? `Profile update by ${session.email}. Reporting manager "${body.reportingTo}" did not match a known employee — reportingManagerId left null.`
      : `Profile update by ${session.email}.`

  await enqueueUpdate({
    queuedBy: session.email,
    entity: 'employee',
    operation: 'update',
    payload: {
      id: employee.id,
      operation: 'employee.profile.update',
      before,
      after,
      notes: note,
    },
  })

  return NextResponse.json({
    ok: true,
    changed: Object.keys(after).length,
    note: 'Profile changes queued. Reflects on the employee record after the next sync (~5-10 minutes; Admin can hit Sync now to speed it up).',
  })
}
