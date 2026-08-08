import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { findApplicationById } from '@/lib/data'
import { PRE_ONBOARDING_TEMPLATE_IDS, type PreOnboardingTemplateId } from '@/lib/preOnboardingEmails'
import { getEmailUnlockState } from '@/lib/preOnboardingEmails/unlockState'

export const runtime = 'nodejs'

/**
 * Records a pre-onboarding email mailto: draft fired by HR.
 *
 * mailto: cannot deliver attachments and the browser will not tell us
 * whether the user actually hit "Send" inside Outlook. We record the act
 * of opening the draft (with the edited subject + attachment checklist)
 * so the downstream unlock chain has something concrete to gate on, and
 * so the audit log captures what wording went out.
 *
 * Body: { templateId, subject, body, attachmentsClaimed[] }
 *   - subject + body are what the user actually saw in the modal (they
 *     may have edited the rendered template). We capture both so future
 *     reviewers know what HR sent, not what the template emitted.
 *
 * Permissions: Admin or HR only. HOD never drafts these.
 *
 * Enforces the unlock chain so the API surface cannot be bypassed
 * by hand-crafted POSTs.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  }
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only HR or Admin can send pre-onboarding emails.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const templateId = typeof body.templateId === 'string' ? body.templateId : ''
  if (!isPreOnboardingTemplateId(templateId)) {
    return NextResponse.json({ message: `Unknown templateId: ${templateId}.` }, { status: 400 })
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const emailBody = typeof body.body === 'string' ? body.body : ''
  const attachmentsClaimed = Array.isArray(body.attachmentsClaimed)
    ? (body.attachmentsClaimed as unknown[]).filter((v): v is string => typeof v === 'string' && !!v.trim())
    : []

  if (!subject) {
    return NextResponse.json({ message: 'Subject is required.' }, { status: 400 })
  }
  if (!emailBody.trim()) {
    return NextResponse.json({ message: 'Body is required.' }, { status: 400 })
  }

  const application = await findApplicationById(params.id)
  if (!application) {
    return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  }

  const state = getEmailUnlockState(application)
  const gate = checkUnlock(templateId, state)
  if (!gate.ok) {
    return NextResponse.json({ message: gate.message }, { status: 409 })
  }

  const now = new Date().toISOString()
  const send = {
    templateId,
    sentAt: now,
    sentBy: session.email,
    subject,
    attachmentsClaimed,
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'application',
      operation: 'update',
      payload: {
        id: application.id,
        operation: 'pre-onboarding.email-sent',
        before: {},
        after: { send },
        notes: `Pre-onboarding email draft opened: ${templateId} (subject: "${subject}").`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, sentAt: now })
}

function isPreOnboardingTemplateId(value: string): value is PreOnboardingTemplateId {
  return (PRE_ONBOARDING_TEMPLATE_IDS as readonly string[]).includes(value)
}

function checkUnlock(
  templateId: PreOnboardingTemplateId,
  state: ReturnType<typeof getEmailUnlockState>,
): { ok: true } | { ok: false; message: string } {
  switch (templateId) {
    case 'offer-intimation':
      if (state.intimation === 'locked') {
        return {
          ok: false,
          message: 'Offer intimation requires pre-onboarding approval to be Approved first.',
        }
      }
      return { ok: true }
    case 'offer-followup':
      if (state.followup === 'locked') {
        return {
          ok: false,
          message:
            'Follow-up requires the offer intimation to have been sent and the candidate to have not yet accepted.',
        }
      }
      return { ok: true }
    case 'appointment-letter':
      if (state.appointment === 'locked') {
        return {
          ok: false,
          message: 'Appointment letter requires the candidate response to be recorded as Accepted.',
        }
      }
      return { ok: true }
    case 'notice-period-checkin':
      if (state.noticeCheckin === 'locked') {
        return {
          ok: false,
          message: 'Notice period check-in requires the appointment letter to have been sent.',
        }
      }
      return { ok: true }
  }
}
