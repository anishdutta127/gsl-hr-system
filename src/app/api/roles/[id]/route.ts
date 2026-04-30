import { NextResponse } from 'next/server'
import { findRoleById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { sanitiseRoleHtml } from '@/lib/sanitiseHtml'

export const runtime = 'nodejs'

const MAX_DESCRIPTION_BYTES = 50 * 1024 // 50 KB rendered HTML

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can edit roles.' }, { status: 403 })
  }

  const role = findRoleById(params.id)
  if (!role) return NextResponse.json({ message: 'Role not found.' }, { status: 404 })

  let body: { description?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const after: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}

  if (typeof body.description === 'string') {
    if (body.description.length > MAX_DESCRIPTION_BYTES) {
      return NextResponse.json(
        { message: `Description is too long (${MAX_DESCRIPTION_BYTES.toLocaleString()} chars max).` },
        { status: 400 },
      )
    }
    // Sanitise on write too. Defence in depth: render-side sanitisation
    // is the primary line, but storing pre-sanitised HTML protects the
    // careers page even if the render-side sanitiser is removed.
    const cleaned = sanitiseRoleHtml(body.description)
    if (cleaned !== role.description) {
      before.description = role.description
      after.description = cleaned
    }
  }

  if (Object.keys(after).length === 0) {
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
        before,
        after,
        notes: `Edited by ${session.email}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
