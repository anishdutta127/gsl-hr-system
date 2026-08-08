import { NextResponse } from 'next/server'
import { findRoleById, loadUsers } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { sanitiseRoleHtml } from '@/lib/sanitiseHtml'
import { validateRoleEdit } from '@/lib/roles/validateRoleEdit'

export const runtime = 'nodejs'

/**
 * Edit a role's details.
 *
 * Accepts any subset of ROLE_DETAIL_EDITABLE_FIELDS (title, department,
 * location, employmentType, description, responsibilities, mustHaves,
 * niceToHaves, salaryRange, hodUserId, hodRound2UserId). Lifecycle fields
 * (status / pauseReason / closeOutcome / closeNotes) belong to
 * PATCH /api/roles/[id]/status, which carries the transition guards.
 *
 * Pipeline safety: this route never writes `pipelineStages` and never touches
 * applications. Applications key on `role.id`, which is immutable, so an edit
 * cannot disturb in-flight candidates or their stage.
 *
 * The runner must be able to write every field enqueued here - see
 * src/lib/roles/editableFields.ts and its parity test.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can edit roles.' }, { status: 403 })
  }

  const role = await findRoleById(params.id)
  if (!role) return NextResponse.json({ message: 'Role not found.' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const knownUserIds = new Set((await loadUsers()).filter((u) => u.active).map((u) => u.id))
  const result = validateRoleEdit(role, body, {
    sanitiseDescription: sanitiseRoleHtml,
    knownUserIds,
  })

  if (!result.ok) {
    return NextResponse.json({ message: result.message ?? 'Invalid request.' }, { status: 400 })
  }

  const changedFields = Object.keys(result.after)
  if (changedFields.length === 0) {
    return NextResponse.json({ ok: true, noop: true })
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'role',
      operation: 'update',
      payload: {
        id: role.id,
        operation: 'role.edit',
        before: result.before,
        after: result.after,
        notes: `Edited ${changedFields.join(', ')} by ${session.email}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    changedFields,
    queued: true,
    note: 'Saved to the queue. Use Sync now to apply it immediately, or wait for the next auto-sync.',
  })
}
