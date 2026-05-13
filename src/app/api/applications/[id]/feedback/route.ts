import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { findApplicationById, findCandidateById } from '@/lib/data'
import { validateFeedbackPayload, roundLabelForStage } from '@/lib/feedbackGate'
import { deliverEmail } from '@/lib/mail'
import { loadUsers } from '@/lib/data'

export const runtime = 'nodejs'

/**
 * Submit hiring-manager interview feedback for an application.
 *
 * Permissions: assigned hiringManagerId on the application, OR Admin / HR.
 * Recruiters submitting feedback for someone else is intentionally
 * blocked - V6 hard rule.
 *
 * Body: { round?, recommendation, strengths, concerns, overallNotes? }
 *   - When `round` is omitted, the route fills it from the application's
 *     currentStage round-label so the UI form doesn't have to know the
 *     mapping. The hiring manager still sees the round chip in the UI;
 *     this is a server-side defaulting convenience.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })

  let body: {
    round?: unknown
    recommendation?: unknown
    strengths?: unknown
    concerns?: unknown
    overallNotes?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const application = findApplicationById(params.id)
  if (!application) {
    return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  }

  const isAssignedHM =
    !!application.hiringManagerId && application.hiringManagerId === session.sub
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  if (!isAssignedHM && !isHrOrAdmin) {
    return NextResponse.json(
      {
        message:
          'Only the assigned hiring manager (or HR/Admin) can submit feedback for this candidate.',
      },
      { status: 403 },
    )
  }

  // Default the round to the current-stage round label when the client did
  // not supply one. The client form can omit it for tighter UI.
  const incoming = { ...body }
  if (typeof incoming.round !== 'string' || !incoming.round.trim()) {
    incoming.round = roundLabelForStage(application.currentStage)
  }

  const sanitised = validateFeedbackPayload(incoming)
  if (!sanitised) {
    return NextResponse.json(
      {
        message:
          'Feedback needs a round, a recommendation, and either strengths or concerns.',
      },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const feedbackEntry = {
    ...sanitised,
    submittedBy: session.email,
    submittedAt: now,
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'application',
      operation: 'update',
      payload: {
        id: application.id,
        operation: 'feedback-submitted',
        before: {},
        after: { feedback: feedbackEntry },
        notes: `${feedbackEntry.round} feedback: ${feedbackEntry.recommendation}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  // Best-effort notification fan-out to the recruiter (Application.createdBy
  // is the recruiter id in this codebase - they get a heads-up that the
  // gate has cleared). Failure here never blocks the submit.
  try {
    const recruiterEmail = application.createdBy
    const candidate = findCandidateById(application.candidateId)
    const submitter = loadUsers().find((u) => u.id === session.sub)?.name ?? session.email
    if (recruiterEmail && recruiterEmail.includes('@')) {
      await deliverEmail({
        to: recruiterEmail,
        subject: `[GSL HR] Feedback submitted for ${candidate?.name ?? 'a candidate'} (${feedbackEntry.round})`,
        body:
          `Hi,\n\n` +
          `${submitter} has submitted ${feedbackEntry.round} feedback for ${candidate?.name ?? 'the candidate'}: ${feedbackEntry.recommendation}.\n\n` +
          `Open the candidate record to review and move them forward.\n`,
        context: `feedback-submitted ${application.id}`,
      })
    }
  } catch (err) {
    console.warn('Feedback notification dispatch failed:', err)
  }

  return NextResponse.json({ ok: true })
}
