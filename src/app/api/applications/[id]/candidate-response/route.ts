import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { findApplicationById } from '@/lib/data'
import {
  CANDIDATE_RESPONSE_TYPES,
  type CandidateOfferResponse,
  type CandidateResponseType,
} from '@/lib/types'

export const runtime = 'nodejs'

const RESPONSE_SET = new Set<string>(CANDIDATE_RESPONSE_TYPES)

/**
 * Capture the candidate's response to the offer intimation. Manual entry
 * by a recruiter because we are not parsing inbound mail in Phase 1.
 *
 * Body: { response, responseDate, notes? }
 *
 * Side effects:
 *   - When response === 'Accepted', the appointment-letter send becomes
 *     available downstream (unlock chain runs off this field).
 *   - When response === 'Declined', the recruiter is invited to also
 *     transition the application to Rejected via a separate step on the
 *     candidate detail page; we do NOT auto-Reject here because the
 *     decline path may still want to keep the candidate warm.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json(
      { message: 'Only Admin or HR can record a candidate response.' },
      { status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const response = typeof body.response === 'string' ? body.response : ''
  if (!RESPONSE_SET.has(response)) {
    return NextResponse.json(
      { message: `Response must be one of: ${CANDIDATE_RESPONSE_TYPES.join(', ')}.` },
      { status: 400 },
    )
  }

  const rawDate = typeof body.responseDate === 'string' ? body.responseDate.trim() : ''
  if (!rawDate) {
    return NextResponse.json({ message: 'Response date required.' }, { status: 400 })
  }
  const parsedDate = new Date(rawDate)
  if (Number.isNaN(parsedDate.getTime())) {
    return NextResponse.json({ message: 'Response date is not a valid date.' }, { status: 400 })
  }

  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : undefined

  const application = findApplicationById(params.id)
  if (!application) {
    return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const candidateOfferResponse: CandidateOfferResponse = {
    response: response as CandidateResponseType,
    responseDate: parsedDate.toISOString(),
    notes,
    recordedBy: session.email,
    recordedAt: now,
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'application',
      operation: 'update',
      payload: {
        id: application.id,
        operation: 'candidate-offer-response',
        before: { candidateOfferResponse: application.candidateOfferResponse },
        after: { candidateOfferResponse },
        notes: `Recorded candidate response: ${response}${notes ? ` - ${notes}` : ''}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, response })
}
