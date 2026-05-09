/*
 * Per-leave operations.
 *
 *   POST   /api/admin/leave/[id]/approve     not in this file (kept here as a hint)
 *   PATCH  /api/admin/leave/[id]             { action: 'approve' | 'reject' | 'recall' | 'cancel' | 'edit',
 *                                             rejectionReason?, recallReason?, edits? }
 *   DELETE /api/admin/leave/[id]             admin override deletion (Admin only)
 *
 * Actions:
 *   approve  - status -> Approved, sets approvedAt + approvedBy
 *              auth: HR/Admin always; HOD only for direct reports
 *   reject   - status -> Rejected, requires rejectionReason
 *              auth: same as approve
 *   recall   - status Approved/Submitted -> Recalled, sets recallReason
 *              auth: HR/Admin always; the employee themselves
 *   cancel   - status Draft/Submitted -> Cancelled (no impact on balance)
 *              auth: HR/Admin always; the employee themselves
 *   edit     - HR-only correction. Body: edits with date/type/reason/totalDays
 *              fields. Audit captures before/after.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  buildHolidayDateSetForEmployee,
  canApproveLeave,
  canReadLeave,
  computeTotalDays,
  loadLeaveApplications,
} from '@/lib/leave'
import { loadEmployeeOptionalHolidays, loadHolidays } from '@/lib/holidays'
import { defaultHybridDays } from '@/lib/roster'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { LeaveApplication, LeaveType } from '@/lib/types'
import { LEAVE_TYPES } from '@/lib/types'

export const runtime = 'nodejs'

const APPS_PATH = 'src/data/leave_applications.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface PatchBody {
  action: 'approve' | 'reject' | 'recall' | 'cancel' | 'edit'
  rejectionReason?: string
  recallReason?: string
  edits?: {
    leaveType?: LeaveType
    startDate?: string
    endDate?: string
    reason?: string
    isHalfDay?: boolean
    halfDaySession?: 'morning' | 'afternoon' | null
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)

  const id = params.id
  const apps = loadLeaveApplications()
  const app = apps.find((a) => a.id === id)
  if (!app) return bad('Leave not found.', 404)

  const employee = findEmployeeById(app.employeeId)
  // employee may have been deleted; we still let HR cancel/correct in that
  // case but block approval flow.

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return bad('Body must be JSON.')
  }

  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isOwner = app.employeeId === session.sub
  const now = new Date().toISOString()

  // Permission per action.
  if (body.action === 'approve' || body.action === 'reject') {
    if (!employee) return bad('Employee for this leave no longer exists.', 404)
    if (
      !canApproveLeave({
        app,
        user: { id: session.sub, role: session.role },
        employee,
      })
    ) {
      return bad('You cannot approve this leave.', 403)
    }
    if (app.status !== 'Submitted') {
      return bad(`Cannot ${body.action} a leave in status ${app.status}.`, 409)
    }
  } else if (body.action === 'recall' || body.action === 'cancel') {
    // Read permission required.
    if (
      !canReadLeave({
        app,
        user: { id: session.sub, role: session.role },
        employee: employee ?? null,
      })
    ) {
      return bad('Forbidden.', 403)
    }
    // Only HR/Admin or the employee themselves can recall/cancel.
    if (!isHrOrAdmin && !isOwner) {
      return bad('Only HR or the leave owner can cancel/recall.', 403)
    }
    if (body.action === 'recall' && app.status !== 'Approved' && app.status !== 'Submitted') {
      return bad(`Cannot recall a leave in status ${app.status}.`, 409)
    }
    if (body.action === 'cancel' && app.status !== 'Draft' && app.status !== 'Submitted') {
      return bad(
        `Cannot cancel a leave in status ${app.status}. Use recall for already-Approved leaves.`,
        409,
      )
    }
  } else if (body.action === 'edit') {
    if (!isHrOrAdmin) return bad('Only HR can edit a leave record.', 403)
    if (app.status === 'Approved' || app.status === 'Recalled' || app.status === 'Cancelled') {
      // HR can correct historical record but the audit notes it.
    }
  } else {
    return bad('Unknown action.')
  }

  if (body.action === 'reject' && !body.rejectionReason?.trim()) {
    return bad('rejectionReason is required for reject.')
  }
  if (body.action === 'recall' && !body.recallReason?.trim()) {
    return bad('recallReason is required for recall.')
  }

  await atomicUpdateJson<LeaveApplication[]>(
    APPS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((a) => {
        if (a.id !== id) return a
        const before = {
          status: a.status,
          approvedAt: a.approvedAt,
          approvedBy: a.approvedBy,
          rejectionReason: a.rejectionReason,
          recallReason: a.recallReason,
          startDate: a.startDate,
          endDate: a.endDate,
          totalDays: a.totalDays,
          leaveType: a.leaveType,
          reason: a.reason,
        }
        let updated: LeaveApplication = a
        if (body.action === 'approve') {
          updated = {
            ...a,
            status: 'Approved',
            approvedAt: now,
            approvedBy: session.email,
          }
        } else if (body.action === 'reject') {
          updated = {
            ...a,
            status: 'Rejected',
            approvedAt: null,
            approvedBy: null,
            rejectionReason: body.rejectionReason!.trim(),
          }
        } else if (body.action === 'recall') {
          updated = {
            ...a,
            status: 'Recalled',
            recallReason: body.recallReason!.trim(),
          }
        } else if (body.action === 'cancel') {
          updated = {
            ...a,
            status: 'Cancelled',
            cancelledBy: session.email,
            cancelledAt: now,
          }
        } else if (body.action === 'edit') {
          // HR correction; recompute totalDays if dates or half-day changed.
          const e = body.edits ?? {}
          let nextStart = e.startDate ?? a.startDate
          let nextEnd = e.endDate ?? a.endDate
          let nextHalf = e.isHalfDay ?? a.isHalfDay
          let nextHalfSession = e.halfDaySession === undefined ? a.halfDaySession : (e.halfDaySession ?? undefined)
          let nextType = e.leaveType ?? a.leaveType
          if (e.leaveType !== undefined && !LEAVE_TYPES.includes(e.leaveType)) {
            throw new Error(`Invalid leaveType ${e.leaveType}`)
          }
          // Recompute totalDays
          const holidays = loadHolidays()
          const picks = loadEmployeeOptionalHolidays()
          const year = Number(nextStart.slice(0, 4))
          const set = buildHolidayDateSetForEmployee({
            holidays,
            picks,
            employeeId: a.employeeId,
            year,
          })
          const hybridDays = employee ? defaultHybridDays(employee.department) : []
          const totalDays = employee
            ? computeTotalDays({
                startDate: nextStart,
                endDate: nextEnd,
                workPattern: employee.workPattern ?? 'office-5day',
                hybridDays,
                holidayDateSet: set,
                isHalfDay: nextHalf,
              })
            : a.totalDays
          updated = {
            ...a,
            startDate: nextStart,
            endDate: nextEnd,
            isHalfDay: nextHalf,
            halfDaySession: nextHalfSession,
            leaveType: nextType,
            reason: e.reason ?? a.reason,
            totalDays,
          }
        }
        updated.auditLog = [
          ...a.auditLog,
          {
            timestamp: now,
            user: session.email,
            action: `leave.${body.action}`,
            before,
            after: {
              status: updated.status,
              approvedAt: updated.approvedAt,
              rejectionReason: updated.rejectionReason,
              recallReason: updated.recallReason,
              startDate: updated.startDate,
              endDate: updated.endDate,
              totalDays: updated.totalDays,
              leaveType: updated.leaveType,
              reason: updated.reason,
            },
            notes:
              body.action === 'reject'
                ? body.rejectionReason
                : body.action === 'recall'
                  ? body.recallReason
                  : undefined,
          },
        ]
        return updated
      })
      return {
        next,
        commitMessage: `feat(leave): ${body.action} ${id.slice(0, 18)}`,
      }
    },
    { defaultValue: [] as LeaveApplication[] },
  )

  return NextResponse.json({
    ok: true,
    note: 'Saved. The leave list updates everywhere once Vercel rebuilds (~2 minutes).',
  })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin') return bad('Only Admin can hard-delete a leave record.', 403)

  const id = params.id
  let removed = false
  await atomicUpdateJson<LeaveApplication[]>(
    APPS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.filter((a) => a.id !== id)
      removed = next.length !== list.length
      return {
        next,
        commitMessage: `feat(leave): hard-delete ${id.slice(0, 18)}`,
      }
    },
    { defaultValue: [] as LeaveApplication[] },
  )

  if (!removed) return bad('Leave not found.', 404)
  return NextResponse.json({ ok: true })
}
