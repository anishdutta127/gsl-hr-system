import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import {
  findCandidateById,
  findRoleById,
  loadApplications,
} from '@/lib/data'
import { canAcceptNewCandidates, isPipelineReadOnly } from '@/lib/roleStatus'
import { isTerminal } from '@/lib/pipeline'

export const runtime = 'nodejs'

/**
 * Move an application's candidate from one role to another.
 *
 * Two queue writes:
 *   1. application.update (stage-transition) — source app to Withdrawn with
 *      a "Moved to <destination>" note. Skipped when source is already
 *      terminal (e.g. Joined, Rejected) — we keep the historical record.
 *   2. application.create — fresh app at Sourced for the destination role.
 *
 * Validation matches the bulk add-to-pipeline rules, plus dedupe against any
 * existing non-terminal app in the destination role.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json(
      { message: 'Only Admin or HR can move candidates.' },
      { status: 403 },
    )
  }

  let body: { destinationRoleId?: unknown; notes?: unknown; force?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const destinationRoleId =
    typeof body.destinationRoleId === 'string' ? body.destinationRoleId : ''
  if (!destinationRoleId) {
    return NextResponse.json({ message: 'Destination role required.' }, { status: 400 })
  }
  const userNotes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const force = body.force === true

  const apps = await loadApplications()
  const sourceApp = apps.find((a) => a.id === params.id)
  if (!sourceApp) {
    return NextResponse.json({ message: 'Source application not found.' }, { status: 404 })
  }

  if (sourceApp.roleId === destinationRoleId) {
    return NextResponse.json(
      { message: 'Source and destination roles are the same.' },
      { status: 400 },
    )
  }

  const sourceRole = await findRoleById(sourceApp.roleId)
  const destinationRole = await findRoleById(destinationRoleId)
  if (!destinationRole) {
    return NextResponse.json({ message: 'Destination role not found.' }, { status: 404 })
  }

  const candidate = await findCandidateById(sourceApp.candidateId)
  if (!candidate) {
    return NextResponse.json({ message: 'Candidate not found.' }, { status: 404 })
  }

  if (!canAcceptNewCandidates(destinationRole)) {
    return NextResponse.json(
      {
        message: `Destination role is ${destinationRole.status}; reopen it before moving candidates in.`,
      },
      { status: 400 },
    )
  }

  const sourceTerminal = isTerminal(sourceApp.currentStage)
  if (sourceTerminal && sourceApp.currentStage === 'Joined') {
    return NextResponse.json(
      {
        message:
          'Cannot move a candidate who has already Joined for this role. Use "Add to additional role" instead.',
      },
      { status: 400 },
    )
  }

  // Dedupe: candidate must not already have an active app in the destination.
  const dup = apps.find(
    (a) =>
      a.candidateId === candidate.id &&
      a.roleId === destinationRole.id &&
      !['Rejected', 'Withdrawn', 'NotInterested'].includes(a.currentStage as string),
  )
  if (dup) {
    return NextResponse.json(
      { message: `${candidate.name} is already in ${destinationRole.title}'s pipeline.` },
      { status: 409 },
    )
  }

  // Past Offered: warn unless caller explicitly opts in via force.
  const pastOffer = ['Offered', 'OfferAccepted', 'DocsCollected'].includes(
    sourceApp.currentStage as string,
  )
  if (pastOffer && !force) {
    return NextResponse.json(
      {
        message: `${candidate.name} is at ${sourceApp.currentStage} for ${sourceRole?.title ?? 'the source role'}. Confirm to move them anyway.`,
        confirmationRequired: true,
      },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const noteSuffix = userNotes ? ` Notes: ${userNotes}` : ''
  const sourceTitle = sourceRole?.title ?? '(removed role)'

  // Pipeline read-only is fine — we still want the audit, but Withdrawn might
  // be rejected by canTransition for closed roles. Skip the source-side write
  // when the source role's pipeline is read-only OR already terminal.
  const skipSourceWrite = sourceTerminal || (sourceRole ? isPipelineReadOnly(sourceRole) : false)

  try {
    if (!skipSourceWrite) {
      await enqueueUpdate({
        queuedBy: session.email,
        entity: 'application',
        operation: 'update',
        payload: {
          id: sourceApp.id,
          operation: 'stage-transition',
          before: {
            currentStage: sourceApp.currentStage,
            stageEnteredAt: sourceApp.stageEnteredAt,
          },
          after: { currentStage: 'Withdrawn', stageEnteredAt: now },
          notes: `Moved to ${destinationRole.title}.${noteSuffix}`,
        },
      })
    }

    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'application',
      operation: 'create',
      payload: {
        id: crypto.randomUUID(),
        candidateId: candidate.id,
        roleId: destinationRole.id,
        currentStage: 'Sourced',
        stageEnteredAt: now,
        createdAt: now,
        createdBy: session.email,
        auditLog: [
          {
            timestamp: now,
            user: session.email,
            action: 'application.create',
            after: {
              candidateId: candidate.id,
              roleId: destinationRole.id,
              currentStage: 'Sourced',
            },
            notes: `Moved from ${sourceTitle}.${noteSuffix}`,
          },
        ],
      },
    })

    // Audit on the candidate too so the move shows up on the candidate page
    // even before the queue applies.
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'candidate',
      operation: 'update',
      payload: {
        id: candidate.id,
        operation: 'candidate.update',
        before: {},
        after: {},
        notes: `Pipeline move: ${sourceTitle} → ${destinationRole.title}.${noteSuffix}`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Move failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    sourceApplicationId: sourceApp.id,
    destinationRoleId: destinationRole.id,
    note: skipSourceWrite
      ? 'Source application left as-is (already terminal); new application created at destination.'
      : 'Source application withdrawn; new application created at destination.',
  })
}
