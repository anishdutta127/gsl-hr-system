import { NextResponse } from 'next/server'
import { findEmployeeById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json(
      { message: 'Only Admin or HR can update onboarding.' },
      { status: 403 },
    )
  }

  const employee = findEmployeeById(params.id)
  if (!employee) return NextResponse.json({ message: 'Employee not found.' }, { status: 404 })

  let body: { itemId?: unknown; done?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }
  const itemId = typeof body.itemId === 'string' ? body.itemId : ''
  const done = Boolean(body.done)
  if (!itemId) return NextResponse.json({ message: 'Item required.' }, { status: 400 })

  const target = (employee.onboardingChecklist ?? []).find((i) => i.id === itemId)
  if (!target) return NextResponse.json({ message: 'Checklist item not found.' }, { status: 404 })

  const now = new Date().toISOString()
  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'employee',
      operation: 'update',
      payload: {
        id: employee.id,
        operation: 'onboarding.toggle',
        before: { itemId, done: target.done, doneAt: target.doneAt, doneBy: target.doneBy },
        after: {
          itemId,
          done,
          doneAt: done ? now : undefined,
          doneBy: done ? session.email : undefined,
        },
        notes: `${done ? 'Checked' : 'Unchecked'}: ${target.label}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
