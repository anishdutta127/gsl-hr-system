import { NextResponse } from 'next/server'
import { findRoleById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import {
  CLOSE_OUTCOMES,
  availableActions,
  nextStatusFor,
  type CloseOutcome,
  type LifecycleAction,
} from '@/lib/roleStatus'

export const runtime = 'nodejs'

interface Body {
  action?: unknown
  reason?: unknown
  outcome?: unknown
  notes?: unknown
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json(
      { message: 'Only Admin or HR can change role status.' },
      { status: 403 },
    )
  }

  const role = findRoleById(params.id)
  if (!role) return NextResponse.json({ message: 'Role not found.' }, { status: 404 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? (body.action as LifecycleAction) : null
  const allowed = availableActions(role).find((a) => a.action === action)
  if (!action || !allowed) {
    return NextResponse.json(
      { message: `Action "${action}" is not allowed from status ${role.status}.` },
      { status: 400 },
    )
  }

  const reason =
    typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  const outcomeRaw = typeof body.outcome === 'string' ? body.outcome : ''
  const outcome: CloseOutcome | null =
    (CLOSE_OUTCOMES as readonly string[]).includes(outcomeRaw) ? (outcomeRaw as CloseOutcome) : null
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''

  if (allowed.needsOutcome && !outcome) {
    return NextResponse.json(
      { message: 'Closing a role requires an outcome.' },
      { status: 400 },
    )
  }

  if (action === 'publish' && (!role.description || role.description.trim().length === 0)) {
    return NextResponse.json(
      { message: 'JD is required to publish.' },
      { status: 400 },
    )
  }

  const nextStatus = nextStatusFor(action)

  const after: Record<string, unknown> = { status: nextStatus }
  if (action === 'pause') {
    after.pauseReason = reason || null
  } else if (action === 'resume') {
    after.pauseReason = null
  } else if (action === 'close') {
    after.closeOutcome = outcome
    after.closeNotes = notes || null
  } else if (action === 'reopen') {
    after.closeOutcome = null
    after.closeNotes = null
    after.pauseReason = null
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'role',
      operation: 'update',
      payload: {
        id: role.id,
        operation: `role.${action}`,
        before: {
          status: role.status,
          pauseReason: role.pauseReason ?? null,
          closeOutcome: role.closeOutcome ?? null,
          closeNotes: role.closeNotes ?? null,
        },
        after,
        notes:
          action === 'pause'
            ? `Paused by ${session.email}.${reason ? ` Reason: ${reason}` : ''}`
            : action === 'close'
              ? `Closed by ${session.email}. Outcome: ${outcome}${notes ? `. ${notes}` : ''}`
              : `${action} by ${session.email}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, action, nextStatus })
}
