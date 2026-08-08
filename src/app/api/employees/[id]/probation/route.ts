/*
 * Probation actions: confirm or extend.
 *
 *   POST /api/employees/[id]/probation
 *     body: { action: 'confirm', confirmationDate?: 'YYYY-MM-DD' }
 *           { action: 'extend',  newEndDate: 'YYYY-MM-DD', reason: string }
 *
 * Confirm: sets confirmationDate (default = today) and bumps
 * employmentStatus to 'Confirmed'. Extend: writes the new probation end
 * date to confirmationDate (we lift it forward) and captures the reason
 * in the audit log; employmentStatus stays 'Probation'.
 *
 * Admin + HR. Mutation goes through the queue as an employee.update so
 * the apply runner picks it up alongside other employee writes.
 */

import { NextResponse } from 'next/server'
import { findEmployeeById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

export const runtime = 'nodejs'

interface ConfirmBody {
  action: 'confirm'
  confirmationDate?: string
}
interface ExtendBody {
  action: 'extend'
  newEndDate: string
  reason: string
}
type Body = ConfirmBody | ExtendBody

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

function isValidDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can manage probation.', 403)
  }

  const employee = await findEmployeeById(params.id)
  if (!employee) return bad('Employee not found.', 404)
  if (employee.status === 'Exited') return bad('Cannot modify probation on exited employee.', 409)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }

  const today = new Date().toISOString().slice(0, 10)

  if (body.action === 'confirm') {
    const confirmationDate = body.confirmationDate ?? today
    if (!isValidDate(confirmationDate)) return bad('confirmationDate must be YYYY-MM-DD.')
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'employee',
      operation: 'update',
      payload: {
        id: employee.id,
        operation: 'probation.confirm',
        before: {
          confirmationDate: employee.confirmationDate ?? null,
          employmentStatus: employee.employmentStatus ?? null,
        },
        after: {
          confirmationDate,
          employmentStatus: 'Confirmed',
        },
        notes: `Probation confirmed by ${session.email}; effective ${confirmationDate}.`,
      },
    })
    return NextResponse.json({
      ok: true,
      action: 'confirm',
      confirmationDate,
      note: 'Confirmation queued. Will reflect in the employee record after the next sync (~10 min, or use Sync now).',
    })
  }

  if (body.action === 'extend') {
    if (!isValidDate(body.newEndDate)) return bad('newEndDate must be YYYY-MM-DD.')
    const reason = (body.reason ?? '').trim()
    if (!reason) return bad('reason is required when extending probation.')
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'employee',
      operation: 'update',
      payload: {
        id: employee.id,
        operation: 'probation.extend',
        before: {
          confirmationDate: employee.confirmationDate ?? null,
          employmentStatus: employee.employmentStatus ?? null,
        },
        after: {
          confirmationDate: body.newEndDate,
          employmentStatus: 'Probation',
        },
        notes: `Probation extended to ${body.newEndDate} by ${session.email}. Reason: ${reason}`,
      },
    })
    return NextResponse.json({
      ok: true,
      action: 'extend',
      newEndDate: body.newEndDate,
      note: 'Extension queued. Will reflect after the next sync.',
    })
  }

  return bad('Unknown action.')
}
