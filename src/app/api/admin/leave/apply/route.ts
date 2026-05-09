/*
 * Apply for leave. HR-mediated by default; self-service path lands when
 * the employee role is wired up (DEFAULT_LEAVE_FLOW env will flip the
 * default UI surface, but the API accepts both shapes today).
 *
 *   POST /api/admin/leave/apply
 *     body: { employeeId, leaveType, startDate, endDate, reason,
 *             isHalfDay?, halfDaySession?, isEmergency?,
 *             approveImmediately?, confirmLossOfPay? }
 *
 * Auth:
 *   Admin/HR can apply on behalf of any employee, with the option to
 *   auto-approve (`approveImmediately`).
 *   HOD can apply for themselves (their own employeeId) only — but the
 *   primary employee self-service path is /api/portal/leave/apply once
 *   employee accounts ship.
 *
 * Validation:
 *   - Overlap with any existing Approved/Submitted leave -> 409
 *   - Negative balance -> 409 unless confirmLossOfPay=true (overflow lands
 *     as lossOfPayDays on the application)
 *   - Half-day must be a single date
 *   - Emergency leaves are retroactive: startDate may be in the past
 *     (up to 7 days). Otherwise startDate must be >= today.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  buildHolidayDateSetForEmployee,
  computeTotalDays,
  hasOverlapWithApproved,
  leaveYearForDate,
  loadLeaveApplications,
  proratedEntitlement,
  recalcBalance,
  splitPaidAndLOP,
} from '@/lib/leave'
import {
  loadEmployeeOptionalHolidays,
  loadHolidays,
} from '@/lib/holidays'
import { defaultHybridDays } from '@/lib/roster'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import {
  LEAVE_ENTITLEMENT_DEFAULTS,
  LEAVE_TYPES,
  type LeaveApplication,
  type LeaveType,
} from '@/lib/types'

export const runtime = 'nodejs'

const APPS_PATH = 'src/data/leave_applications.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface Body {
  employeeId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  reason: string
  isHalfDay?: boolean
  halfDaySession?: 'morning' | 'afternoon'
  isEmergency?: boolean
  approveImmediately?: boolean
  confirmLossOfPay?: boolean
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }

  const employeeId = body.employeeId?.trim()
  if (!employeeId) return bad('employeeId is required.')

  // Permission: HR/Admin always allowed; HOD only for themselves; everyone
  // else blocked from this admin route. Self-service portal route handles
  // employee-self once accounts ship.
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  if (!isHrOrAdmin) {
    if (employeeId !== session.sub) {
      return bad('You can only apply leave for yourself via this route.', 403)
    }
  }

  if (!LEAVE_TYPES.includes(body.leaveType)) {
    return bad(`leaveType must be one of: ${LEAVE_TYPES.join(', ')}.`)
  }
  if (!isValidDate(body.startDate) || !isValidDate(body.endDate)) {
    return bad('startDate and endDate must be YYYY-MM-DD.')
  }
  if (body.endDate < body.startDate) {
    return bad('endDate must be on or after startDate.')
  }
  if (body.isHalfDay && body.startDate !== body.endDate) {
    return bad('Half-day leave must start and end on the same date.')
  }

  const employee = findEmployeeById(employeeId)
  if (!employee) return bad('Employee not found.', 404)
  if (employee.status === 'Exited') return bad('Cannot apply leave for an exited employee.', 409)

  const today = new Date().toISOString().slice(0, 10)
  if (body.startDate < today && !body.isEmergency) {
    return bad(
      'Past-dated leave must be flagged as Emergency. Set isEmergency=true to log retroactively.',
    )
  }
  if (body.isEmergency) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (body.startDate < sevenDaysAgo) {
      return bad('Emergency leave can only be logged up to 7 days in the past.')
    }
  }

  // Overlap detection.
  const allApps = loadLeaveApplications()
  const overlap = hasOverlapWithApproved({
    applications: allApps,
    employeeId,
    startDate: body.startDate,
    endDate: body.endDate,
  })
  if (overlap) {
    return bad(
      `Overlaps an existing ${overlap.status.toLowerCase()} leave (${overlap.startDate} to ${overlap.endDate}). Cancel that first.`,
      409,
    )
  }

  // Compute totalDays.
  const holidays = loadHolidays()
  const picks = loadEmployeeOptionalHolidays()
  const yearOfStart = Number(body.startDate.slice(0, 4))
  const holidaySet = buildHolidayDateSetForEmployee({
    holidays,
    picks,
    employeeId: employee.id,
    year: yearOfStart,
  })
  const hybridDays = defaultHybridDays(employee.department)
  let totalDays: number
  try {
    totalDays = computeTotalDays({
      startDate: body.startDate,
      endDate: body.endDate,
      workPattern: employee.workPattern ?? 'office-5day',
      hybridDays,
      holidayDateSet: holidaySet,
      isHalfDay: !!body.isHalfDay,
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Could not compute totalDays.')
  }
  if (totalDays === 0) {
    return bad(
      'Computed total leave days is 0 (window contains only weekends/holidays for this work pattern).',
    )
  }

  // Compute available balance for casual / sick. Loss-of-pay split.
  const yearStart = leaveYearForDate(body.startDate)
  const ent = {
    casual: proratedEntitlement({
      fullEntitlement: LEAVE_ENTITLEMENT_DEFAULTS.casual,
      yearStart,
      joiningDate: employee.dateOfJoining,
    }),
    sick: proratedEntitlement({
      fullEntitlement: LEAVE_ENTITLEMENT_DEFAULTS.sick,
      yearStart,
      joiningDate: employee.dateOfJoining,
    }),
  }
  const currentBalance = recalcBalance({
    employeeId,
    leaveYearStart: yearStart,
    applications: allApps,
    entitlements: ent,
  })

  let lossOfPayDays = 0
  if (body.leaveType === 'casual' || body.leaveType === 'sick') {
    const bucket = body.leaveType === 'casual' ? currentBalance.casual : currentBalance.sick
    const split = splitPaidAndLOP({
      applyingDays: totalDays,
      availableBalance: bucket.balance,
    })
    lossOfPayDays = split.lop
    if (lossOfPayDays > 0 && !body.confirmLossOfPay) {
      return NextResponse.json(
        {
          message: `This leave will exceed the ${body.leaveType} balance by ${lossOfPayDays} day${lossOfPayDays === 1 ? '' : 's'}. Resubmit with confirmLossOfPay=true to log the overflow as Loss of Pay.`,
          requiresLOPConfirmation: true,
          available: bucket.balance,
          totalDays,
          lossOfPayDays,
        },
        { status: 409 },
      )
    }
  }

  // Build the application record.
  const now = new Date().toISOString()
  const goingStraightToApproved = isHrOrAdmin && body.approveImmediately === true
  const newApp: LeaveApplication = {
    id: `lv-${crypto.randomUUID()}`,
    employeeId,
    leaveType: body.leaveType,
    startDate: body.startDate,
    endDate: body.endDate,
    totalDays,
    reason: body.reason?.trim() ?? '',
    isHalfDay: !!body.isHalfDay,
    halfDaySession: body.halfDaySession,
    status: goingStraightToApproved ? 'Approved' : 'Submitted',
    appliedAt: now,
    appliedBy: session.email,
    submittedAt: now,
    approvedBy: goingStraightToApproved ? session.email : null,
    approvedAt: goingStraightToApproved ? now : null,
    rejectionReason: null,
    recallReason: null,
    isEmergency: !!body.isEmergency,
    lossOfPayDays,
    auditLog: [
      {
        timestamp: now,
        user: session.email,
        action: goingStraightToApproved ? 'leave.apply-and-approve' : 'leave.apply',
        after: {
          leaveType: body.leaveType,
          startDate: body.startDate,
          endDate: body.endDate,
          totalDays,
          lossOfPayDays,
          status: goingStraightToApproved ? 'Approved' : 'Submitted',
          isEmergency: !!body.isEmergency,
        },
        notes: body.isEmergency ? 'Emergency / retroactive leave.' : undefined,
      },
    ],
  }

  await atomicUpdateJson<LeaveApplication[]>(
    APPS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: [...list, newApp],
        commitMessage: `feat(leave): ${goingStraightToApproved ? 'apply+approve' : 'apply'} ${body.leaveType} for ${employee.name.slice(0, 40)} (${employee.id.slice(0, 8)})`,
      }
    },
    { defaultValue: [] as LeaveApplication[] },
  )

  return NextResponse.json({
    ok: true,
    leave: {
      id: newApp.id,
      status: newApp.status,
      totalDays,
      lossOfPayDays,
    },
    note: goingStraightToApproved
      ? 'Applied and approved. Reflects on the roster once Vercel rebuilds (~2 minutes).'
      : 'Submitted for approval. Manager sees it once Vercel rebuilds (~2 minutes).',
  })
}
