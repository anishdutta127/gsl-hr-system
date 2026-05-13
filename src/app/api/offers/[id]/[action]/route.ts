import { NextResponse } from 'next/server'
import { findApplicationById, findOfferById, findRoleById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { canTransition } from '@/lib/pipeline'
import { isOfferDeclineReason } from '@/lib/stageTransition'
import type { Offer } from '@/lib/types'

export const runtime = 'nodejs'

type Action = 'approve' | 'send' | 'resend' | 'accept' | 'decline' | 'withdraw'

/**
 * State-transition table. `from` lists the statuses an offer must be in
 * for the action to be valid; `to` is the resulting status (resend stays
 * at Sent on purpose - it's a re-trigger of the same state, not a new one).
 */
const ALLOWED_TRANSITIONS: Record<Action, { from: Offer['status'][]; to: Offer['status'] }> = {
  approve: { from: ['Draft'], to: 'Approved' },
  send: { from: ['Approved', 'Generated'], to: 'Sent' },
  resend: { from: ['Sent'], to: 'Sent' },
  accept: { from: ['Sent'], to: 'Accepted' },
  decline: { from: ['Sent'], to: 'Declined' },
  withdraw: { from: ['Draft', 'Approved', 'Generated', 'Sent'], to: 'Withdrawn' },
}

const APPLICATION_STAGE_BY_ACTION: Partial<Record<Action, string>> = {
  send: 'Offered',
  accept: 'OfferAccepted',
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; action: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can act on offers.' }, { status: 403 })
  }

  const action = params.action as Action
  const rules = ALLOWED_TRANSITIONS[action]
  if (!rules) {
    return NextResponse.json({ message: 'Unknown action.' }, { status: 400 })
  }

  const offer = findOfferById(params.id)
  if (!offer) return NextResponse.json({ message: 'Offer not found.' }, { status: 404 })
  if (!rules.from.includes(offer.status)) {
    return NextResponse.json(
      { message: `Cannot ${action} an offer currently ${offer.status}.` },
      { status: 400 },
    )
  }

  let body: {
    notes?: unknown
    declineReason?: unknown
    declineNotes?: unknown
    acceptedCtcAnnual?: unknown
    acceptedOn?: unknown
    acceptedJoiningDate?: unknown
  } = {}
  try {
    body = await request.json()
  } catch {
    /* empty body allowed */
  }
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : ''
  const now = new Date().toISOString()

  // Decline: reason is mandatory (mirrors the rejection capture pattern on
  // application-level rejects). 'Other' demands free text so reports stay
  // useful instead of being a pile of unlabelled "Other"s.
  let declineReason: string | undefined
  let declineNotes: string | undefined
  if (action === 'decline') {
    if (!isOfferDeclineReason(body.declineReason)) {
      return NextResponse.json(
        { message: 'A decline reason is required.' },
        { status: 400 },
      )
    }
    declineReason = body.declineReason
    declineNotes =
      typeof body.declineNotes === 'string' && body.declineNotes.trim()
        ? body.declineNotes.trim().slice(0, 2000)
        : undefined
    if (declineReason === 'Other' && !declineNotes) {
      return NextResponse.json(
        { message: 'Free-text notes are required when reason is Other.' },
        { status: 400 },
      )
    }
  }

  // Accept: structured details optional. CTC defaults to the original
  // offer.ctcAnnual (so the employee-creation flow has something even
  // when HR doesn't bother filling the form). Joining date defaults to
  // the offer's proposedJoiningDate.
  let acceptedCtcAnnual: number | undefined
  let acceptedOn: string | undefined
  let acceptedJoiningDate: string | undefined
  if (action === 'accept') {
    if (typeof body.acceptedCtcAnnual === 'number' && body.acceptedCtcAnnual > 0) {
      acceptedCtcAnnual = Math.round(body.acceptedCtcAnnual)
    }
    if (typeof body.acceptedOn === 'string' && /^\d{4}-\d{2}-\d{2}/.test(body.acceptedOn)) {
      acceptedOn = body.acceptedOn
    }
    if (
      typeof body.acceptedJoiningDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}/.test(body.acceptedJoiningDate)
    ) {
      acceptedJoiningDate = body.acceptedJoiningDate
    }
  }

  const after: Record<string, unknown> = { status: rules.to }
  if (action === 'approve') {
    after.approvedAt = now
    after.approvedBy = session.email
  }
  if (action === 'send' || action === 'resend') {
    after.sentAt = now
  }
  if (action === 'resend') {
    after.appendResentAt = now
  }
  if (action === 'accept' || action === 'decline') {
    after.respondedAt = now
  }
  if (action === 'accept') {
    after.acceptedCtcAnnual = acceptedCtcAnnual ?? offer.compensation.ctcAnnual
    after.acceptedOn = acceptedOn ?? now.slice(0, 10)
    if (acceptedJoiningDate) after.acceptedJoiningDate = acceptedJoiningDate
    else if (offer.proposedJoiningDate)
      after.acceptedJoiningDate = offer.proposedJoiningDate
  }
  if (action === 'decline') {
    after.declineReason = declineReason
    if (declineNotes) after.declineNotes = declineNotes
  }

  // Compose audit notes carrying the structured signal so the timeline
  // surfaces "Declined: Compensation. Counter from current employer."
  // without consumers having to dig into separate fields.
  let composedNotes = notes
  if (action === 'decline' && declineReason) {
    composedNotes =
      `Declined: ${declineReason}` + (declineNotes ? `. ${declineNotes}` : '')
  }
  if (action === 'resend') {
    composedNotes = composedNotes || 'Offer letter resent to candidate.'
  }
  if (action === 'send' && !composedNotes) {
    composedNotes = 'Offer letter sent to candidate.'
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'offer',
      operation: 'update',
      payload: {
        id: offer.id,
        operation: `offer.${action}`,
        before: {
          status: offer.status,
          approvedAt: offer.approvedAt,
          sentAt: offer.sentAt,
          respondedAt: offer.respondedAt,
        },
        after,
        notes: composedNotes,
      },
    })

    const targetStage = APPLICATION_STAGE_BY_ACTION[action]
    if (targetStage) {
      const app = findApplicationById(offer.applicationId)
      if (app) {
        const role = findRoleById(app.roleId)
        if (role) {
          const { valid } = canTransition(role, app.currentStage, targetStage)
          if (valid) {
            await enqueueUpdate({
              queuedBy: session.email,
              entity: 'application',
              operation: 'update',
              payload: {
                id: app.id,
                operation: 'stage-transition',
                before: { currentStage: app.currentStage, stageEnteredAt: app.stageEnteredAt },
                after: { currentStage: targetStage, stageEnteredAt: now },
                notes: `Offer ${action}.`,
              },
            })
          }
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
