import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { loadApplications, findRoleById, findCandidateById, loadUsers } from '@/lib/data'
import { canTransition } from '@/lib/pipeline'
import { isPipelineReadOnly } from '@/lib/roleStatus'
import {
  isHodRoundStage,
  isRejectionReason,
  type RejectionReason,
} from '@/lib/stageTransition'
import { deliverEmail } from '@/lib/mail'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  }

  let body: {
    targetStage?: unknown
    notes?: unknown
    rejectionReason?: unknown
    rejectionNotes?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const targetStage = typeof body.targetStage === 'string' ? body.targetStage : ''
  const notes = typeof body.notes === 'string' ? body.notes : undefined
  if (!targetStage) {
    return NextResponse.json({ message: 'Target stage required.' }, { status: 400 })
  }

  const application = loadApplications().find((a) => a.id === params.id)
  if (!application) {
    return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  }

  const role = findRoleById(application.roleId)
  if (!role) {
    return NextResponse.json({ message: 'Role not found for this application.' }, { status: 404 })
  }

  if (isPipelineReadOnly(role)) {
    return NextResponse.json(
      {
        message: `Pipeline is read-only because the role is ${role.status}. Reopen the role to move candidates again.`,
      },
      { status: 400 },
    )
  }

  const { valid, reason } = canTransition(role, application.currentStage, targetStage)
  if (!valid) {
    return NextResponse.json({ message: reason ?? 'Invalid transition.' }, { status: 400 })
  }

  // Reject capture: required when target is Rejected.
  let rejectionReason: RejectionReason | undefined
  let rejectionNotes: string | undefined
  if (targetStage === 'Rejected') {
    if (!isRejectionReason(body.rejectionReason)) {
      return NextResponse.json(
        { message: 'A rejection reason is required.' },
        { status: 400 },
      )
    }
    rejectionReason = body.rejectionReason
    rejectionNotes =
      typeof body.rejectionNotes === 'string' && body.rejectionNotes.trim()
        ? body.rejectionNotes.trim()
        : undefined
    if (rejectionReason === 'Other' && !rejectionNotes) {
      return NextResponse.json(
        { message: 'Free-text notes are required when reason is Other.' },
        { status: 400 },
      )
    }
  }

  // Compose audit notes: always carry the rejection reason if present so it
  // surfaces on the candidate timeline without a schema migration.
  const composedNotes = rejectionReason
    ? `Rejected: ${rejectionReason}${rejectionNotes ? `. ${rejectionNotes}` : ''}`
    : notes

  const after: Record<string, unknown> = {
    currentStage: targetStage,
    stageEnteredAt: new Date().toISOString(),
  }
  if (rejectionReason) {
    after.rejectionReason = rejectionReason
    if (rejectionNotes) after.rejectionNotes = rejectionNotes
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'application',
      operation: 'update',
      payload: {
        id: application.id,
        operation: 'stage-transition',
        before: { currentStage: application.currentStage, stageEnteredAt: application.stageEnteredAt },
        after,
        notes: composedNotes,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  // HOD-round transition: notify the assigned HOD (and HOD round 2 owner
  // for the Academics two-HOD pipeline). Failures here MUST NOT block the
  // transition response; deliverEmail already swallows on failure but we
  // still wrap in try/catch for defence.
  if (isHodRoundStage(targetStage)) {
    try {
      await notifyHodOfRound(role, application.candidateId, targetStage, session.email)
    } catch (err) {
      console.warn('HOD notification dispatch failed:', err)
    }
  }

  return NextResponse.json({ ok: true })
}

async function notifyHodOfRound(
  role: import('@/lib/types').Role,
  candidateId: string,
  stage: string,
  movedBy: string,
): Promise<void> {
  const candidate = findCandidateById(candidateId)
  const candidateName = candidate?.name ?? 'a candidate'
  const users = loadUsers()
  const targets =
    stage === 'HOD2RoundScheduled' && role.hodRound2UserId
      ? [role.hodRound2UserId]
      : role.hodUserId
        ? [role.hodUserId]
        : []
  for (const userId of targets) {
    const hod = users.find((u) => u.id === userId)
    if (!hod?.email) continue
    await deliverEmail({
      to: hod.email,
      subject: `[GSL HR] HOD round scheduled for ${candidateName} (${role.title})`,
      body:
        `Hi ${hod.name?.split(' ')[0] ?? hod.name ?? 'there'},\n\n` +
        `${candidateName} is now at "${stage}" for ${role.title}.\n\n` +
        `Open the candidate's record from the GSL HR pipeline to schedule the round and score the rubric.\n\n` +
        `Moved by ${movedBy}.\n`,
      context: `hod-round-notify ${role.id} ${candidateId} ${stage}`,
    })
  }
}
