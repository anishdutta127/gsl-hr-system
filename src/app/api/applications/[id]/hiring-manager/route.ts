import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { findApplicationById, loadUsers } from '@/lib/data'

export const runtime = 'nodejs'

/**
 * Assign (or clear) the hiring manager on an application.
 *
 * Body: { hiringManagerId: string | null }
 *
 * Only Admin + HR may assign. The chosen user must be an active staff
 * user; we do not constrain the role (Admin / HR / HOD / Leadership can
 * all be hiring managers for a specific candidate).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json(
      { message: 'Only Admin or HR can assign a hiring manager.' },
      { status: 403 },
    )
  }

  let body: { hiringManagerId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const raw = body.hiringManagerId
  const hiringManagerId =
    typeof raw === 'string' && raw.trim() ? raw.trim() : null

  const application = findApplicationById(params.id)
  if (!application) {
    return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  }

  if (hiringManagerId) {
    const user = loadUsers().find((u) => u.id === hiringManagerId)
    if (!user) {
      return NextResponse.json(
        { message: 'Hiring manager not found.' },
        { status: 404 },
      )
    }
    if (!user.active) {
      return NextResponse.json(
        { message: 'That user is deactivated; pick someone else.' },
        { status: 400 },
      )
    }
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'application',
      operation: 'update',
      payload: {
        id: application.id,
        operation: 'assign-hiring-manager',
        before: { hiringManagerId: application.hiringManagerId ?? null },
        after: { hiringManagerId },
        notes: hiringManagerId
          ? `Assigned hiring manager: ${loadUsers().find((u) => u.id === hiringManagerId)?.name ?? hiringManagerId}.`
          : 'Cleared hiring manager.',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
