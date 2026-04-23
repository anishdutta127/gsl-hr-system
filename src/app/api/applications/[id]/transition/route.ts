import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { loadApplications, findRoleById } from '@/lib/data'
import { canTransition } from '@/lib/pipeline'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  }

  let body: { targetStage?: unknown; notes?: unknown }
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

  const { valid, reason } = canTransition(role, application.currentStage, targetStage)
  if (!valid) {
    return NextResponse.json({ message: reason ?? 'Invalid transition.' }, { status: 400 })
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
        after: { currentStage: targetStage, stageEnteredAt: new Date().toISOString() },
        notes,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
