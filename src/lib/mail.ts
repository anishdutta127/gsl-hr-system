/*
 * Email delivery for candidate magic links.
 *
 * Phase 1: queue every outgoing email as a "careers_application" entry so the
 * self-hosted sync runner writes it to src/data/_outbound_mail.json through
 * the same queue path as every other write. Anish forwards links manually at
 * pilot volume. When volume grows or HR asks, we swap this for Resend by
 * adding RESEND_API_KEY and calling their API here; the queue log becomes
 * the audit trail.
 *
 * Never returns a failure to the caller: mail delivery should not block a
 * candidate-facing request. Errors are logged and the queue entry is tried
 * again on the next tick.
 */

import { enqueueUpdate } from './queue/pendingUpdates'

export interface OutboundEmail {
  to: string
  subject: string
  body: string
  /** Human context: e.g., "magic link for candidate abc-123" */
  context: string
}

export async function deliverEmail(email: OutboundEmail): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY
    if (apiKey) {
      await deliverViaResend(email, apiKey)
      return
    }
  } catch (err) {
    console.warn('Resend delivery failed, falling back to queue log:', err)
  }

  try {
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'careers_application',
      operation: 'create',
      payload: {
        _kind: 'outbound-mail',
        to: email.to,
        subject: email.subject,
        body: email.body,
        context: email.context,
        createdAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('Failed to queue outbound mail:', err)
  }
}

async function deliverViaResend(email: OutboundEmail, apiKey: string): Promise<void> {
  const from = process.env.RESEND_FROM ?? 'GSL HR <hr@gsl.edu.in>'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: email.to,
      subject: email.subject,
      text: email.body,
    }),
  })
  if (!response.ok) {
    throw new Error(`Resend API ${response.status}: ${await response.text()}`)
  }
}
