import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { findApplicationById, findRoleById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can draft offers.' }, { status: 403 })
  }

  let body: {
    applicationId?: unknown
    designation?: unknown
    location?: unknown
    ctcAnnual?: unknown
    fixedMonthly?: unknown
    variableAnnual?: unknown
    proposedJoiningDate?: unknown
    noticePeriodDays?: unknown
    reportingTo?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : ''
  const designation = typeof body.designation === 'string' ? body.designation.trim() : ''
  const location = typeof body.location === 'string' ? body.location.trim() : ''
  const ctcAnnual = typeof body.ctcAnnual === 'number' ? body.ctcAnnual : 0
  const fixedMonthly = typeof body.fixedMonthly === 'number' ? body.fixedMonthly : 0
  const variableAnnual = typeof body.variableAnnual === 'number' ? body.variableAnnual : 0
  const proposedJoiningDate = typeof body.proposedJoiningDate === 'string' ? body.proposedJoiningDate : ''
  const noticePeriodDays = typeof body.noticePeriodDays === 'number' ? body.noticePeriodDays : 60
  const reportingTo = typeof body.reportingTo === 'string' ? body.reportingTo.trim() : ''

  if (!applicationId) return NextResponse.json({ message: 'Application required.' }, { status: 400 })
  if (!designation) return NextResponse.json({ message: 'Designation required.' }, { status: 400 })
  if (!(ctcAnnual > 0)) return NextResponse.json({ message: 'CTC must be positive.' }, { status: 400 })

  const app = findApplicationById(applicationId)
  if (!app) return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  const role = findRoleById(app.roleId)
  if (!role) return NextResponse.json({ message: 'Role not found.' }, { status: 404 })

  const offerId = crypto.randomUUID()
  const now = new Date().toISOString()

  const offerPayload = {
    id: offerId,
    applicationId,
    candidateId: app.candidateId,
    roleId: role.id,
    status: 'Draft',
    compensation: {
      ctcAnnual,
      fixedMonthly: fixedMonthly || undefined,
      variableAnnual: variableAnnual || undefined,
      noticePeriodDays,
    },
    proposedJoiningDate: proposedJoiningDate || undefined,
    location: location || role.location,
    designation,
    reportingTo: reportingTo || undefined,
    createdAt: now,
    createdBy: session.email,
    auditLog: [
      {
        timestamp: now,
        user: session.email,
        action: 'offer.create',
        after: { status: 'Draft', designation, ctcAnnual },
      },
    ],
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'offer',
      operation: 'create',
      payload: offerPayload,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, offerId })
}
