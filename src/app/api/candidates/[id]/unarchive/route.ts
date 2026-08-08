import { NextResponse } from 'next/server'
import { findCandidateById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

export const runtime = 'nodejs'

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can unarchive.' }, { status: 403 })
  }

  const candidate = await findCandidateById(params.id)
  if (!candidate) return NextResponse.json({ message: 'Candidate not found.' }, { status: 404 })
  if (candidate.status !== 'Archived') {
    return NextResponse.json({ message: 'Candidate is not archived.' }, { status: 400 })
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'candidate',
      operation: 'update',
      payload: {
        id: candidate.id,
        operation: 'candidate.unarchive',
        before: { status: 'Archived' },
        after: { status: 'Active' },
        notes: `Unarchived by ${session.email}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
