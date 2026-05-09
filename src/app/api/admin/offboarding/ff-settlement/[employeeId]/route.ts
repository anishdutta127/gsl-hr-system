/*
 * Full and final settlement record. Admin + HR can edit; Accounts (when
 * the role lands) will mark as paid. Leadership/HOD have no access.
 *
 *   PUT  /api/admin/offboarding/ff-settlement/[employeeId]
 *     body: FFSettlement fields
 *   POST /api/admin/offboarding/ff-settlement/[employeeId]/mark-paid
 *     stamps paidAt + paidBy
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import { loadFFSettlements } from '@/lib/offboardingTasks'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { FFSettlement } from '@/lib/types'

export const runtime = 'nodejs'

const FILE_PATH = 'src/data/ff_settlements.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface Body {
  finalSalaryDays?: number
  leaveEncashment?: number
  recoveryItems?: Array<{ label: string; amount: number }>
  noticePeriodAdjustment?: number
  totalNet?: number
  notes?: string
  markPaid?: boolean
}

export async function PUT(
  request: Request,
  { params }: { params: { employeeId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can edit F&F settlements.', 403)
  }

  const employee = findEmployeeById(params.employeeId)
  if (!employee) return bad('Employee not found.', 404)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }

  const now = new Date().toISOString()
  const existing = loadFFSettlements().find((f) => f.employeeId === employee.id)

  const next: FFSettlement = {
    employeeId: employee.id,
    finalSalaryDays: body.finalSalaryDays ?? existing?.finalSalaryDays ?? 0,
    leaveEncashment: body.leaveEncashment ?? existing?.leaveEncashment ?? 0,
    recoveryItems: body.recoveryItems ?? existing?.recoveryItems ?? [],
    noticePeriodAdjustment:
      body.noticePeriodAdjustment ?? existing?.noticePeriodAdjustment ?? 0,
    totalNet: body.totalNet ?? existing?.totalNet ?? 0,
    paidAt: body.markPaid ? now : (existing?.paidAt ?? null),
    paidBy: body.markPaid ? session.email : (existing?.paidBy ?? null),
    notes: body.notes ?? existing?.notes ?? '',
    auditLog: [
      ...(existing?.auditLog ?? []),
      {
        timestamp: now,
        user: session.email,
        action: body.markPaid
          ? 'ff-settlement.mark-paid'
          : existing
            ? 'ff-settlement.update'
            : 'ff-settlement.create',
        after: {
          finalSalaryDays: body.finalSalaryDays,
          leaveEncashment: body.leaveEncashment,
          totalNet: body.totalNet,
          paidAt: body.markPaid ? now : undefined,
        },
      },
    ],
  }

  await atomicUpdateJson<FFSettlement[]>(
    FILE_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const without = list.filter((f) => f.employeeId !== employee.id)
      return {
        next: [...without, next],
        commitMessage: `feat(offboarding): F&F ${body.markPaid ? 'paid' : 'updated'} for ${employee.id.slice(0, 8)}`,
      }
    },
    { defaultValue: [] as FFSettlement[] },
  )

  return NextResponse.json({
    ok: true,
    note: 'Settlement saved. Reflects once Vercel rebuilds (~2 minutes).',
  })
}
