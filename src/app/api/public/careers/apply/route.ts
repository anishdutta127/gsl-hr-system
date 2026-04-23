/*
 * Public candidate application intake. Creates a Candidate + Application,
 * issues the first magic link, and emails it to the candidate.
 *
 * Safeguards:
 *   - honeypot field `website` (must be empty)
 *   - IP-keyed rate limit: 5 per hour
 *   - role must exist and be Open
 *
 * When abuse logs cross the threshold, the TODOS entry promotes this to
 * hCaptcha. Until then, friction stays earned-by-threat only.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { findRoleById } from '@/lib/data'
import { mintMagicLink } from '@/lib/candidateAuth'
import { deliverEmail } from '@/lib/mail'
import { loadCompany } from '@/lib/company'
import { rateLimited } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ipOf(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]
    if (first) return first.trim()
  }
  return request.headers.get('x-real-ip') ?? 'unknown'
}

function portalBaseUrl(request: Request): string {
  if (process.env.GSL_PUBLIC_URL) return process.env.GSL_PUBLIC_URL.replace(/\/$/, '')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  if (host) return `${proto}://${host}`
  return 'https://gsl-hr-system.vercel.app'
}

export async function POST(request: Request) {
  const ip = ipOf(request)
  if (rateLimited(`apply:${ip}`, 5, 60 * 60)) {
    return NextResponse.json(
      { message: 'Too many applications from this network. Try again in an hour.' },
      { status: 429 },
    )
  }

  let body: {
    roleId?: unknown
    name?: unknown
    email?: unknown
    phone?: unknown
    coverNote?: unknown
    website?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  // Honeypot — silently swallow
  if (typeof body.website === 'string' && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true })
  }

  const roleId = typeof body.roleId === 'string' ? body.roleId : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const coverNote = typeof body.coverNote === 'string' ? body.coverNote.trim() : ''

  if (!roleId) return NextResponse.json({ message: 'Role missing.' }, { status: 400 })
  if (!name || name.length > 120) return NextResponse.json({ message: 'Name required (up to 120 characters).' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ message: 'Valid email required.' }, { status: 400 })
  if (!phone) return NextResponse.json({ message: 'Phone required.' }, { status: 400 })
  if (coverNote.length > 2000) return NextResponse.json({ message: 'Cover note too long.' }, { status: 400 })

  const role = findRoleById(roleId)
  if (!role || role.status !== 'Open') {
    return NextResponse.json({ message: 'That role is not accepting applications right now.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const candidateId = crypto.randomUUID()
  const applicationId = crypto.randomUUID()
  const company = loadCompany()

  try {
    await enqueueUpdate({
      queuedBy: 'public:careers',
      entity: 'candidate',
      operation: 'create',
      payload: {
        id: candidateId,
        name,
        email,
        phone,
        source: 'Application',
        notes: coverNote,
        createdAt: now,
        createdBy: 'public:careers',
        auditLog: [
          {
            timestamp: now,
            user: 'public:careers',
            action: 'candidate.create',
            after: { name, email, source: 'Application', roleId },
            notes: 'Self-applied via /careers',
          },
        ],
      },
    })
    await enqueueUpdate({
      queuedBy: 'public:careers',
      entity: 'application',
      operation: 'create',
      payload: {
        id: applicationId,
        candidateId,
        roleId,
        currentStage: 'Sourced',
        stageEnteredAt: now,
        createdAt: now,
        createdBy: 'public:careers',
        auditLog: [
          {
            timestamp: now,
            user: 'public:careers',
            action: 'application.create',
            after: { candidateId, roleId, currentStage: 'Sourced' },
          },
        ],
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save.'
    return NextResponse.json({ message }, { status: 503 })
  }

  try {
    const nonce = crypto.randomUUID()
    const { token } = await mintMagicLink({ candidateId, applicationId, nonce })
    const base = portalBaseUrl(request)
    const link = `${base}/portal/exchange?t=${encodeURIComponent(token)}`

    await deliverEmail({
      to: email,
      subject: `We received your application — ${role.title} at ${company.name}`,
      body: [
        `Hi ${name.split(' ')[0]},`,
        '',
        `Thanks for applying for ${role.title} at ${company.name}. We've got your details.`,
        '',
        'Your application portal is here:',
        link,
        '',
        'The link expires in 15 minutes. If it does, head to /portal/request-new-link and we will send a fresh one.',
        '',
        `— ${company.hrContact.name}, ${company.hrContact.title}`,
      ].join('\n'),
      context: `welcome magic link for candidate ${candidateId}`,
    })
  } catch (err) {
    // Mail failure should not block the response — the queued entry still creates
    // the candidate record and Shruti can manually send a fresh link.
    console.error('Magic link email failed:', err)
  }

  return NextResponse.json({ ok: true, candidateId, applicationId })
}
