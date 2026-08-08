/*
 * Issue a fresh magic link to a candidate who requested one from
 * /portal/request-new-link. Intentionally does not reveal whether the email
 * matches a record: same response either way, so the surface can't be used
 * for enumeration. Still rate-limited to prevent email bombing.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { loadCandidates } from '@/lib/data'
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
  return 'unknown'
}

function portalBaseUrl(request: Request): string {
  if (process.env.GSL_PUBLIC_URL) return process.env.GSL_PUBLIC_URL.replace(/\/$/, '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  if (host) return `${proto}://${host}`
  return 'https://gsl-hr-system.vercel.app'
}

export async function POST(request: Request) {
  const ip = ipOf(request)
  if (rateLimited(`magic-link:${ip}`, 5, 60 * 60)) {
    return NextResponse.json({ ok: true }) // silent cap: same response as success
  }

  let body: { email?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ message: 'Valid email required.' }, { status: 400 })
  }

  const candidate = (await loadCandidates()).find((c) => c.email.toLowerCase() === email)
  if (!candidate) {
    // Still return ok to prevent enumeration. Log for ops visibility.
    console.info('magic-link request for unknown email:', email)
    return NextResponse.json({ ok: true })
  }

  try {
    const nonce = crypto.randomUUID()
    const { token } = await mintMagicLink({ candidateId: candidate.id, nonce })
    const base = portalBaseUrl(request)
    const link = `${base}/portal/exchange?t=${encodeURIComponent(token)}`
    const company = loadCompany()
    await deliverEmail({
      to: candidate.email,
      subject: `Your ${company.name} portal link`,
      body: [
        `Hi ${candidate.name.split(' ')[0]},`,
        '',
        'Here is a fresh link to your application portal. It expires in 15 minutes.',
        '',
        link,
        '',
        `- ${company.hrContact.name}, ${company.hrContact.title}`,
      ].join('\n'),
      context: `reissued magic link for candidate ${candidate.id}`,
    })
  } catch (err) {
    console.error('Failed to issue magic link:', err)
  }

  return NextResponse.json({ ok: true })
}
