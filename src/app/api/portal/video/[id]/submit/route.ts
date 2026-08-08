import { NextResponse } from 'next/server'
import { findApplicationById, findRoleById } from '@/lib/data'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { canTransition } from '@/lib/pipeline'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { validateVideoUrl } from '@/lib/videoUrl'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const candidateId = await getCurrentCandidateId()
  if (!candidateId) {
    return NextResponse.json({ message: 'Session expired.' }, { status: 401 })
  }

  const app = await findApplicationById(params.id)
  if (!app || app.candidateId !== candidateId) {
    return NextResponse.json({ message: 'Not found.' }, { status: 404 })
  }
  const role = await findRoleById(app.roleId)
  if (!role) {
    return NextResponse.json({ message: 'Role missing.' }, { status: 404 })
  }
  if (app.currentStage !== 'VideoSent') {
    return NextResponse.json({ message: 'Video step is not open.' }, { status: 400 })
  }

  let body: { url?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const check = validateVideoUrl(url)
  if (!check.valid) {
    return NextResponse.json({ message: check.reason ?? 'Invalid link.' }, { status: 400 })
  }

  const target = 'VideoDone'
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
        after: {
          currentStage: target,
          stageEnteredAt: new Date().toISOString(),
          videoUrl: url,
        },
        notes: `Candidate submitted video link on ${check.host}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
