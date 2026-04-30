import { NextResponse } from 'next/server'
import { findCandidateById, loadCandidates } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { CANDIDATE_SOURCES, type CandidateSource } from '@/lib/types'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can edit candidates.' }, { status: 403 })
  }

  const candidate = findCandidateById(params.id)
  if (!candidate) return NextResponse.json({ message: 'Candidate not found.' }, { status: 404 })

  let body: {
    name?: unknown
    email?: unknown
    phone?: unknown
    source?: unknown
    notes?: unknown
    programmes?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const after: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ message: 'Name cannot be empty.' }, { status: 400 })
    if (name.length > 120) return NextResponse.json({ message: 'Name is too long.' }, { status: 400 })
    if (name !== candidate.name) {
      before.name = candidate.name
      after.name = name
    }
  }

  if (typeof body.email === 'string') {
    const email = body.email.trim()
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ message: 'Email format is invalid.' }, { status: 400 })
    }
    if (email && email.toLowerCase() !== candidate.email.toLowerCase()) {
      const dup = loadCandidates().find(
        (c) => c.id !== candidate.id && c.email.toLowerCase() === email.toLowerCase(),
      )
      if (dup) {
        return NextResponse.json(
          {
            message: `Another candidate (${dup.name}) already uses this email. Edit the other record or contact support to merge.`,
          },
          { status: 409 },
        )
      }
    }
    if (email !== candidate.email) {
      before.email = candidate.email
      after.email = email
    }
  }

  if (typeof body.phone === 'string') {
    const phone = body.phone.trim()
    if (phone !== (candidate.phone ?? '')) {
      before.phone = candidate.phone ?? ''
      after.phone = phone
    }
  }

  if (typeof body.source === 'string') {
    const sourceValid = (CANDIDATE_SOURCES as readonly string[]).includes(body.source)
    if (!sourceValid) {
      return NextResponse.json({ message: 'Invalid source.' }, { status: 400 })
    }
    const source = body.source as CandidateSource
    if (source !== candidate.source) {
      before.source = candidate.source
      after.source = source
    }
  }

  if (typeof body.notes === 'string') {
    const notes = body.notes
    if (notes.length > 8000) {
      return NextResponse.json({ message: 'Notes are too long (8000 chars max).' }, { status: 400 })
    }
    if (notes !== (candidate.notes ?? '')) {
      before.notes = candidate.notes ?? ''
      after.notes = notes
    }
  }

  if (Array.isArray(body.programmes)) {
    const programmes = body.programmes
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter(Boolean)
    const current = candidate.tags?.programmes ?? []
    const sameSet =
      programmes.length === current.length &&
      programmes.every((p) => current.includes(p)) &&
      current.every((p) => programmes.includes(p))
    if (!sameSet) {
      before.programmes = current
      after.programmes = programmes
    }
  }

  if (Object.keys(after).length === 0) {
    return NextResponse.json({ ok: true, noop: true })
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'candidate',
      operation: 'update',
      payload: {
        id: candidate.id,
        operation: 'candidate.update',
        before,
        after,
        notes: `Edited by ${session.email}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
