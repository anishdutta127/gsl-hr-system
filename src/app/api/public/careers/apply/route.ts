/*
 * Public candidate application intake. Creates a Candidate + Application,
 * optionally stores a resume PDF, issues the first magic link, and emails
 * it to the candidate.
 *
 * Multipart/form-data input:
 *   roleId, name, email, phone, coverNote, website (honeypot), resume (file)
 *
 * Safeguards:
 *   - honeypot field `website` (must be empty)
 *   - IP-keyed rate limit: 5 per hour
 *   - role must exist and be Open
 *   - resume file optional; if present: PDF only, 5 MB cap
 *
 * Resume lands at data/resumes/applications/[YYYY]/[MM]/[candidateId].pdf —
 * a fresh subtree under the data/resumes root so the reader's traversal
 * guard accepts it without a config patch. See src/lib/resumePath.ts.
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
import {
  deleteBinaryFile,
  putBinaryFile,
  QueueUpstreamError,
} from '@/lib/queue/githubQueue'
import { buildApplicationResumePath } from '@/lib/resumePath'
import {
  PUBLIC_APPLY_PROFILE,
  validateUploadedResume,
} from '@/lib/resumeUpload'

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

function strField(form: FormData, name: string): string {
  const v = form.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

export async function POST(request: Request) {
  const ip = ipOf(request)
  if (rateLimited(`apply:${ip}`, 5, 60 * 60)) {
    return NextResponse.json(
      { message: 'Too many applications from this network. Try again in an hour.' },
      { status: 429 },
    )
  }

  // Accept either multipart/form-data (with optional resume file) or
  // legacy JSON (no resume). Browsers from the new RoleApplyForm always
  // send multipart; JSON path retained as a defensive fallback.
  const contentType = request.headers.get('content-type') ?? ''
  let roleId: string, name: string, email: string, phone: string, coverNote: string, website: string
  let resumeFile: File | null = null

  if (contentType.startsWith('multipart/form-data')) {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
    }
    roleId = strField(form, 'roleId')
    name = strField(form, 'name')
    email = strField(form, 'email')
    phone = strField(form, 'phone')
    coverNote = strField(form, 'coverNote')
    website = strField(form, 'website')
    const f = form.get('resume')
    if (f instanceof File && f.size > 0) resumeFile = f
  } else {
    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
    }
    roleId = typeof body.roleId === 'string' ? body.roleId : ''
    name = typeof body.name === 'string' ? body.name.trim() : ''
    email = typeof body.email === 'string' ? body.email.trim() : ''
    phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    coverNote = typeof body.coverNote === 'string' ? body.coverNote.trim() : ''
    website = typeof body.website === 'string' ? body.website.trim() : ''
  }

  // Honeypot: silently swallow
  if (website.length > 0) {
    return NextResponse.json({ ok: true })
  }

  if (!roleId) return NextResponse.json({ message: 'Role missing.' }, { status: 400 })
  if (!name || name.length > 120) {
    return NextResponse.json({ message: 'Name required (up to 120 characters).' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ message: 'Valid email required.' }, { status: 400 })
  }
  if (!phone) return NextResponse.json({ message: 'Phone required.' }, { status: 400 })
  if (coverNote.length > 2000) {
    return NextResponse.json({ message: 'Cover note too long.' }, { status: 400 })
  }

  const role = findRoleById(roleId)
  if (!role || role.status !== 'Open') {
    return NextResponse.json(
      { message: 'That role is not accepting applications right now.' },
      { status: 400 },
    )
  }

  let resumeExt: string | undefined
  if (resumeFile) {
    const check = validateUploadedResume(resumeFile, PUBLIC_APPLY_PROFILE)
    if (!check.ok) {
      return NextResponse.json({ message: check.message }, { status: check.status })
    }
    resumeExt = check.ext
  }

  const now = new Date().toISOString()
  const candidateId = crypto.randomUUID()
  const applicationId = crypto.randomUUID()
  const company = loadCompany()

  let resumeRepoPath: string | undefined
  if (resumeFile && resumeExt) {
    resumeRepoPath = buildApplicationResumePath(candidateId, resumeExt)
    const bytes = Buffer.from(await resumeFile.arrayBuffer())
    try {
      await putBinaryFile(
        resumeRepoPath,
        bytes,
        `feat(resumes): public application from ${name.slice(0, 40)} (${candidateId.slice(0, 8)})`,
      )
    } catch (err) {
      if (err instanceof QueueUpstreamError && err.status === 409) {
        console.error('[public-apply-resume] 409 path conflict on', resumeRepoPath, err.body)
        return NextResponse.json(
          { message: 'Could not store your resume. Please try again in a minute.' },
          { status: 503 },
        )
      }
      const message = err instanceof Error ? err.message : 'Resume upload failed.'
      return NextResponse.json({ message }, { status: 503 })
    }
  }

  let recordsQueued = false
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
        resumeFilePath: resumeRepoPath,
        createdAt: now,
        createdBy: 'public:careers',
        auditLog: [
          {
            timestamp: now,
            user: 'public:careers',
            action: 'candidate.create',
            after: {
              name,
              email,
              source: 'Application',
              roleId,
              ...(resumeRepoPath ? { resumeFilePath: resumeRepoPath } : {}),
            },
            notes: resumeRepoPath
              ? 'Self-applied via /careers with resume.'
              : 'Self-applied via /careers (no resume attached).',
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
    recordsQueued = true
  } catch (err) {
    if (resumeRepoPath && !recordsQueued) {
      // Orphan cleanup: file landed but we couldn't queue the candidate +
      // application records. Drop the PDF so the repo doesn't accumulate
      // unreferenced uploads. Best-effort; logged on failure.
      await deleteBinaryFile(resumeRepoPath, 'enqueue failed for public application')
    }
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
      subject: `We received your application for ${role.title} at ${company.name}`,
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
        `- ${company.hrContact.name}, ${company.hrContact.title}`,
      ].join('\n'),
      context: `welcome magic link for candidate ${candidateId}`,
    })
  } catch (err) {
    // Mail failure should not block the response: the queued entry still creates
    // the candidate record and Shruti can manually send a fresh link.
    console.error('Magic link email failed:', err)
  }

  return NextResponse.json({ ok: true, candidateId, applicationId })
}
