import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { loadCandidates } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { CANDIDATE_SOURCES, type CandidateSource } from '@/lib/types'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Fast resume paste-in. HR pastes a block of resume text + minimal metadata;
 * we create a Candidate record with searchableText populated from what they
 * pasted, so the text is immediately greppable on /candidates and matchable
 * on /roles/[id]/match.
 *
 * Batch intake via zip drop is already handled by scripts/import_resumes.py;
 * this endpoint covers the "one resume just landed in my inbox" case.
 */
export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can add candidates.' }, { status: 403 })
  }

  let body: {
    name?: unknown
    email?: unknown
    phone?: unknown
    source?: unknown
    programmes?: unknown
    resumeText?: unknown
    notes?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const source =
    typeof body.source === 'string' && (CANDIDATE_SOURCES as readonly string[]).includes(body.source)
      ? (body.source as CandidateSource)
      : 'HRTeam'
  const programmes = Array.isArray(body.programmes)
    ? body.programmes.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map((p) => p.trim())
    : []
  const resumeText =
    typeof body.resumeText === 'string' ? body.resumeText.replace(/\s+/g, ' ').trim().slice(0, 8000) : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : ''

  if (!name) return NextResponse.json({ message: 'Name is required.' }, { status: 400 })
  if (name.length > 120) return NextResponse.json({ message: 'Name is too long.' }, { status: 400 })
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ message: 'Email looks malformed.' }, { status: 400 })
  }
  if (!resumeText && !notes) {
    return NextResponse.json(
      { message: 'Paste at least the resume text or a note so the record has something searchable.' },
      { status: 400 },
    )
  }

  // Duplicate detection: if email is supplied and matches an existing candidate
  // (case-insensitive), short-circuit. HR lands on the existing record and
  // never sees a 404 from a stale queue-create.
  if (email) {
    const lowered = email.toLowerCase()
    const existing = loadCandidates().find(
      (c) => c.email && c.email.trim().toLowerCase() === lowered,
    )
    if (existing) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        candidateId: existing.id,
        archived: existing.status === 'Archived',
        name: existing.name,
      })
    }
  }

  const candidateId = crypto.randomUUID()
  const now = new Date().toISOString()

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'candidate',
      operation: 'create',
      payload: {
        id: candidateId,
        name,
        email,
        phone,
        source,
        resumeFilePath: undefined,
        searchableText: resumeText || undefined,
        tags: programmes.length > 0 ? { programmes } : undefined,
        status: 'Active',
        consentedAt: null,
        notes: notes || `Paste-in by ${session.email} on ${now.slice(0, 10)}.`,
        createdAt: now,
        createdBy: session.email,
        auditLog: [
          {
            timestamp: now,
            user: session.email,
            action: 'candidate.create',
            after: { name, email, source, programmes },
            notes: 'Created via paste-in import.',
          },
        ],
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, duplicate: false, candidateId, queued: true })
}
