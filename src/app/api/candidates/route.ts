import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { CANDIDATE_SOURCES, type CandidateSource } from '@/lib/types'
import { findRoleById } from '@/lib/data'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only HR or Admin can add candidates.' }, { status: 403 })
  }

  let body: {
    name?: unknown
    email?: unknown
    phone?: unknown
    source?: unknown
    notes?: unknown
    roleId?: unknown
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
      : 'Other'
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const roleId = typeof body.roleId === 'string' ? body.roleId : ''

  if (!name) return NextResponse.json({ message: 'Name is required.' }, { status: 400 })
  if (name.length > 120) return NextResponse.json({ message: 'Name is too long.' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ message: 'Valid email required.' }, { status: 400 })
  if (!roleId) return NextResponse.json({ message: 'Role required.' }, { status: 400 })

  const role = await findRoleById(roleId)
  if (!role) return NextResponse.json({ message: 'Role not found.' }, { status: 404 })

  const now = new Date().toISOString()
  const candidateId = crypto.randomUUID()
  const applicationId = crypto.randomUUID()

  const candidatePayload = {
    id: candidateId,
    name,
    email,
    phone,
    source,
    notes,
    createdAt: now,
    createdBy: session.email,
    auditLog: [
      {
        timestamp: now,
        user: session.email,
        action: 'candidate.create',
        after: { name, email, source },
      },
    ],
  }

  const applicationPayload = {
    id: applicationId,
    candidateId,
    roleId,
    currentStage: 'Sourced',
    stageEnteredAt: now,
    createdAt: now,
    createdBy: session.email,
    auditLog: [
      {
        timestamp: now,
        user: session.email,
        action: 'application.create',
        after: { candidateId, roleId, currentStage: 'Sourced' },
      },
    ],
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'candidate',
      operation: 'create',
      payload: candidatePayload,
    })
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'application',
      operation: 'create',
      payload: applicationPayload,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, candidateId, applicationId })
}
