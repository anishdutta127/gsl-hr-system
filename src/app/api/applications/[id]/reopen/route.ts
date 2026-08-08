import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { loadApplications, findRoleById, findCandidateById } from '@/lib/data'
import { isTerminal } from '@/lib/pipeline'
import { isPipelineReadOnly } from '@/lib/roleStatus'

export const runtime = 'nodejs'

const MIN_REASON_LENGTH = 10

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
    reason?: unknown
    notifyCandidate?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const targetStage = typeof body.targetStage === 'string' ? body.targetStage.trim() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const notifyCandidate = body.notifyCandidate === true

  if (!targetStage) {
    return NextResponse.json({ message: 'A target stage is required.' }, { status: 400 })
  }
  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      { message: `A reason of at least ${MIN_REASON_LENGTH} characters is required.` },
      { status: 400 },
    )
  }

  const application = (await loadApplications()).find((a) => a.id === params.id)
  if (!application) {
    return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  }

  if (!isTerminal(application.currentStage)) {
    return NextResponse.json(
      { message: 'Only candidates in a terminal state can be reopened.' },
      { status: 400 },
    )
  }

  const role = await findRoleById(application.roleId)
  if (!role) {
    return NextResponse.json({ message: 'Role not found for this application.' }, { status: 404 })
  }
  if (isPipelineReadOnly(role)) {
    return NextResponse.json(
      {
        message: `Pipeline is read-only because the role is ${role.status}. Reopen the role to reopen candidates again.`,
      },
      { status: 400 },
    )
  }

  if (isTerminal(targetStage)) {
    return NextResponse.json(
      { message: 'Cannot reopen straight into another terminal stage.' },
      { status: 400 },
    )
  }
  if (!role.pipelineStages.includes(targetStage)) {
    return NextResponse.json(
      { message: `${targetStage} is not a valid stage for ${role.title}.` },
      { status: 400 },
    )
  }

  const isAdmin = session.role === 'Admin'
  const isHr = session.role === 'HR'
  const isAssignedRecruiter = application.createdBy === session.email
  if (!isAdmin && !isHr && !isAssignedRecruiter) {
    return NextResponse.json(
      { message: 'Only HR / Admin or the assigned recruiter can reopen a candidate.' },
      { status: 403 },
    )
  }

  const candidate = await findCandidateById(application.candidateId)
  const fromStage = application.currentStage
  const composedNotes = `Reopened from ${fromStage} to ${targetStage}: ${reason}${
    notifyCandidate ? ' (follow-up reminder requested)' : ''
  }`

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'application',
      operation: 'update',
      payload: {
        id: application.id,
        operation: 'stage-transition',
        before: { currentStage: fromStage, stageEnteredAt: application.stageEnteredAt },
        after: {
          currentStage: targetStage,
          stageEnteredAt: new Date().toISOString(),
        },
        notes: composedNotes,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    candidateName: candidate?.name,
    fromStage,
    toStage: targetStage,
  })
}
