import { NextResponse } from 'next/server'
import { findApplicationById, findRoleById } from '@/lib/data'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { canTransition, isTerminal } from '@/lib/pipeline'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: { applicationId: string } },
) {
  const candidateId = await getCurrentCandidateId()
  if (!candidateId) {
    return NextResponse.json({ message: 'Session expired.' }, { status: 401 })
  }

  const app = findApplicationById(params.applicationId)
  if (!app || app.candidateId !== candidateId) {
    return NextResponse.json({ message: 'Not found.' }, { status: 404 })
  }
  const role = findRoleById(app.roleId)
  if (!role) {
    return NextResponse.json({ message: 'Role missing.' }, { status: 404 })
  }
  if (isTerminal(app.currentStage)) {
    return NextResponse.json({ message: 'Already closed.' }, { status: 400 })
  }

  let body: { reason?: unknown; notes?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    /* empty body ok */
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 120) : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''

  const target = 'Withdrawn'
  const { valid, reason: failure } = canTransition(role, app.currentStage, target)
  if (!valid) {
    return NextResponse.json({ message: failure ?? 'Invalid transition.' }, { status: 400 })
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
        notes: [
          'Candidate self-withdrew.',
          reason ? `Reason: ${reason}.` : null,
          notes ? `Notes: ${notes}` : null,
        ]
          .filter(Boolean)
          .join(' '),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
