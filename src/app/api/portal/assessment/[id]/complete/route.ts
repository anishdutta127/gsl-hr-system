import { NextResponse } from 'next/server'
import { findApplicationById, findRoleById } from '@/lib/data'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { canTransition } from '@/lib/pipeline'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const candidateId = await getCurrentCandidateId()
  if (!candidateId) {
    return NextResponse.json({ message: 'Session expired.' }, { status: 401 })
  }

  const app = findApplicationById(params.id)
  if (!app || app.candidateId !== candidateId) {
    return NextResponse.json({ message: 'Not found.' }, { status: 404 })
  }
  const role = findRoleById(app.roleId)
  if (!role) {
    return NextResponse.json({ message: 'Role missing.' }, { status: 404 })
  }

  if (app.currentStage !== 'AssessmentSent') {
    return NextResponse.json({ message: 'Assessment is not open for this application.' }, { status: 400 })
  }

  let body: { notes?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    /* empty body is fine */
  }
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : ''

  const target = 'AssessmentDone'
  const { valid, reason } = canTransition(role, app.currentStage, target)
  if (!valid) {
    return NextResponse.json({ message: reason ?? 'Invalid transition.' }, { status: 400 })
  }

  try {
    await enqueueUpdate({
      queuedBy: `candidate:${candidateId}`,
      entity: 'application',
      operation: 'update',
      payload: {
        id: app.id,
        operation: 'stage-transition',
        before: { currentStage: app.currentStage, stageEnteredAt: app.stageEnteredAt },
        after: { currentStage: target, stageEnteredAt: new Date().toISOString() },
        notes: notes ? `Candidate marked assessment complete. Notes: ${notes}` : 'Candidate marked assessment complete.',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
