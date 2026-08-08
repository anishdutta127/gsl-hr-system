import { NextResponse } from 'next/server'
import { findEmailTemplateById } from '@/lib/emailTemplates'
import { findCandidateById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

export const runtime = 'nodejs'

/**
 * HR has pasted the rendered email into their client and sent it. This
 * endpoint records that act on the candidate's audit log so the pipeline
 * shows "Shruti emailed ROUND1-INVITE at 3:04 PM". No SMTP, no SES --
 * HR's outbox is the ground truth, we record the intent.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can log emails.' }, { status: 403 })
  }

  const template = findEmailTemplateById(params.id)
  if (!template) return NextResponse.json({ message: 'Template not found.' }, { status: 404 })

  let body: { candidateId?: unknown; subject?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }
  const candidateId = typeof body.candidateId === 'string' ? body.candidateId : ''
  const subject = typeof body.subject === 'string' ? body.subject.slice(0, 200) : template.title
  if (!candidateId) return NextResponse.json({ message: 'candidateId required.' }, { status: 400 })

  const candidate = await findCandidateById(candidateId)
  if (!candidate) return NextResponse.json({ message: 'Candidate not found.' }, { status: 404 })

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'candidate',
      operation: 'update',
      payload: {
        id: candidate.id,
        operation: 'email.sent',
        before: {},
        after: { templateId: template.id, templateTitle: template.title, subject },
        notes: `${session.email} sent "${template.title}" to ${candidate.name}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
