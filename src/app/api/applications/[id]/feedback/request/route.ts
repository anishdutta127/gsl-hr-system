import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { findApplicationById, loadUsers } from '@/lib/data'

export const runtime = 'nodejs'

/**
 * Audit-only: recruiter (Admin / HR / HOD) records that they have
 * requested hiring-manager feedback for this application. Used by the
 * "Send feedback request" mailto: button on the candidate detail page;
 * the actual email open happens client-side (mailto:), this route just
 * persists the intent so the audit timeline shows who chased and when.
 *
 * Body: {} (everything is derived from the session + application).
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR' && session.role !== 'HOD') {
    return NextResponse.json(
      { message: 'Not allowed.' },
      { status: 403 },
    )
  }

  const application = findApplicationById(params.id)
  if (!application) {
    return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  }

  const hmName = application.hiringManagerId
    ? (loadUsers().find((u) => u.id === application.hiringManagerId)?.name ?? application.hiringManagerId)
    : '(no hiring manager assigned)'

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'application',
      operation: 'update',
      payload: {
        id: application.id,
        operation: 'feedback-requested',
        before: {},
        after: { hiringManagerName: hmName, currentStage: application.currentStage },
        notes: `${session.email} requested feedback from ${hmName}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
