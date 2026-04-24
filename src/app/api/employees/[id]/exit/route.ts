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
    return NextResponse.json({ message: 'Only Admin or HR can initiate exit.' }, { status: 403 })
  }

  const employee = findEmployeeById(params.id)
  if (!employee) return NextResponse.json({ message: 'Employee not found.' }, { status: 404 })
  if (employee.status === 'Exited') {
    return NextResponse.json({ message: 'Already exited.' }, { status: 400 })
  }

  let body: {
    lastWorkingDay?: unknown
    reason?: unknown
    notes?: unknown
    relievingLetterIssued?: unknown
    experienceLetterIssued?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const lastWorkingDay = typeof body.lastWorkingDay === 'string' ? body.lastWorkingDay : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 5000) : ''
  const relievingLetterIssued = Boolean(body.relievingLetterIssued)
  const experienceLetterIssued = Boolean(body.experienceLetterIssued)

  if (!lastWorkingDay) return NextResponse.json({ message: 'Last working day required.' }, { status: 400 })
  if (!reason) return NextResponse.json({ message: 'Reason required.' }, { status: 400 })

  const now = new Date().toISOString()
  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'employee',
      operation: 'update',
      payload: {
        id: employee.id,
        operation: 'exit.initiate',
        before: { status: employee.status, exit: employee.exit ?? null },
        after: {
          status: 'Exited',
          exit: {
            lastWorkingDay,
            reason,
            relievingLetterIssued,
            experienceLetterIssued,
            notes: notes || undefined,
          },
        },
        notes: `Exit initiated by ${session.email} — LWD ${lastWorkingDay}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
