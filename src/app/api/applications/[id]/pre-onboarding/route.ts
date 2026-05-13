import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { findApplicationById } from '@/lib/data'
import type { PreOnboardingApproval } from '@/lib/types'
import {
  transitionPreOnboardingApproval,
  type ApprovalAction,
} from '@/lib/preOnboardingApproval'

export const runtime = 'nodejs'

/**
 * Pre-onboarding approval workflow.
 *
 * Sequential two-party: hiring-manager approves first (sets ctcConfirmed,
 * joiningDateConfirmed, locationConfirmed, positionConfirmed, optional
 * notes), then HR-Admin approves (no field edits required — the act of
 * approving is the change). Either party may reject; rejection captures
 * a reason and flips status to Rejected.
 *
 * Body:
 *   { action: 'initiate',
 *     ctcConfirmed, joiningDateConfirmed, locationConfirmed, positionConfirmed, notes? }
 *   { action: 'hiring-manager-approve', notes? }
 *   { action: 'hr-approve', notes? }
 *   { action: 'reject', rejectionReason, rejectedBy: 'hiring-manager' | 'hr' }
 *   { action: 'reset' }  — Admin-only, returns the application to 'Not Started'
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? body.action : ''
  if (!action) {
    return NextResponse.json({ message: 'action required.' }, { status: 400 })
  }

  const application = findApplicationById(params.id)
  if (!application) {
    return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  }

  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isAssignedHm = !!application.hiringManagerId && application.hiringManagerId === session.sub
  const isAdmin = session.role === 'Admin'
  const now = new Date().toISOString()

  const existing: PreOnboardingApproval = application.preOnboardingApproval ?? {
    status: 'Not Started',
  }

  const stepped: ApprovalAction | null = (() => {
    if (action === 'initiate') {
      return {
        kind: 'initiate',
        ctcConfirmed: numericOrUndefined(body.ctcConfirmed) ?? 0,
        joiningDateConfirmed: stringOrUndefined(body.joiningDateConfirmed) ?? '',
        locationConfirmed: stringOrUndefined(body.locationConfirmed) ?? '',
        positionConfirmed: stringOrUndefined(body.positionConfirmed) ?? '',
        notes: stringOrUndefined(body.notes),
      }
    }
    if (action === 'hiring-manager-approve') {
      return { kind: 'hiring-manager-approve', notes: stringOrUndefined(body.notes), by: session.email, at: now }
    }
    if (action === 'hr-approve') {
      return { kind: 'hr-approve', notes: stringOrUndefined(body.notes), by: session.email, at: now }
    }
    if (action === 'reject') {
      const rejectedBy = body.rejectedBy === 'hiring-manager' || body.rejectedBy === 'hr' ? body.rejectedBy : null
      if (!rejectedBy) return null
      return {
        kind: 'reject',
        rejectedBy,
        rejectionReason: stringOrUndefined(body.rejectionReason) ?? '',
      }
    }
    if (action === 'reset') return { kind: 'reset' }
    return null
  })()

  if (!stepped) {
    return NextResponse.json({ message: `Unknown action: ${action}.` }, { status: 400 })
  }

  const result = transitionPreOnboardingApproval(existing, stepped, {
    isAssignedHiringManager: isAssignedHm,
    isHrOrAdmin,
    isAdmin,
  })
  if (!result.ok || !result.next) {
    return NextResponse.json(
      { message: reasonToMessage(result.reason ?? 'unknown') },
      { status: result.reason?.startsWith('only-') || result.reason === 'admin-only' || result.reason?.startsWith('cannot-reject-') ? 403 : 400 },
    )
  }

  const next = result.next
  const auditNote = describeTransition(stepped, session.email)

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'application',
      operation: 'update',
      payload: {
        id: application.id,
        operation: 'pre-onboarding.approval',
        before: { preOnboardingApproval: existing },
        after: { preOnboardingApproval: next },
        notes: auditNote,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, status: next.status })
}

function reasonToMessage(reason: string): string {
  switch (reason) {
    case 'only-hm-or-hr-can-initiate':
      return 'Only the assigned hiring manager (or HR/Admin) can initiate approval.'
    case 'only-hm-can-approve':
      return 'Only the assigned hiring manager (or HR/Admin) can approve.'
    case 'only-hr-can-approve':
      return 'Only HR or Admin can grant the HR approval.'
    case 'cannot-reject-as-hm':
      return 'Not allowed to reject as hiring manager.'
    case 'cannot-reject-as-hr':
      return 'Not allowed to reject as HR.'
    case 'admin-only':
      return 'Only Admin can reset approval.'
    case 'ctc-required':
      return 'CTC required.'
    case 'joining-date-required':
      return 'Joining date required.'
    case 'location-required':
      return 'Location required.'
    case 'position-required':
      return 'Position required.'
    case 'reason-required':
      return 'Rejection reason required.'
    default:
      if (reason.startsWith('cannot-from-')) {
        return `Cannot perform that action from status "${reason.slice('cannot-from-'.length)}".`
      }
      return 'Approval transition failed.'
  }
}

function describeTransition(action: ApprovalAction, email: string): string {
  switch (action.kind) {
    case 'initiate':
      return `Pre-onboarding approval initiated by ${email}.`
    case 'hiring-manager-approve':
      return `Hiring manager approved (${email}).`
    case 'hr-approve':
      return `HR approved (${email}). Offer intimation may now be sent.`
    case 'reject':
      return `Pre-onboarding rejected by ${action.rejectedBy} (${email}): ${action.rejectionReason}.`
    case 'reset':
      return `Pre-onboarding approval reset by Admin (${email}).`
  }
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function numericOrUndefined(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}
