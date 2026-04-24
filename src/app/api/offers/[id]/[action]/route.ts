import { NextResponse } from 'next/server'
import { findApplicationById, findOfferById, findRoleById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { canTransition } from '@/lib/pipeline'
import type { Offer } from '@/lib/types'

export const runtime = 'nodejs'

type Action = 'approve' | 'send' | 'accept' | 'decline' | 'withdraw'

const ALLOWED_TRANSITIONS: Record<Action, { from: Offer['status'][]; to: Offer['status'] }> = {
  approve: { from: ['Draft'], to: 'Approved' },
  send: { from: ['Approved', 'Generated'], to: 'Sent' },
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

  let body: { notes?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    /* empty body allowed */
  }
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : ''
  const now = new Date().toISOString()

  const after: Record<string, unknown> = { status: rules.to }
  if (action === 'approve') {
    after.approvedAt = now
    after.approvedBy = session.email
  }
  if (action === 'send') {
    after.sentAt = now
  }
  if (action === 'accept' || action === 'decline') {
    after.respondedAt = now
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
        notes,
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
