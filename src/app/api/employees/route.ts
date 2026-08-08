import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  findApplicationById,
  findCandidateById,
  findRoleById,
  loadEmployees,
  loadOffers,
} from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { canTransition } from '@/lib/pipeline'
import { defaultOnboardingChecklist } from '@/lib/onboarding'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can activate employees.' }, { status: 403 })
  }

  let body: {
    applicationId?: unknown
    employeeCode?: unknown
    designation?: unknown
    department?: unknown
    location?: unknown
    dateOfJoining?: unknown
    ctcAnnual?: unknown
    reportingTo?: unknown
    phone?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : ''
  const employeeCode = typeof body.employeeCode === 'string' ? body.employeeCode.trim() : ''
  const designation = typeof body.designation === 'string' ? body.designation.trim() : ''
  const department = typeof body.department === 'string' ? body.department.trim() : ''
  const location = typeof body.location === 'string' ? body.location.trim() : ''
  const dateOfJoining = typeof body.dateOfJoining === 'string' ? body.dateOfJoining : ''
  const ctcAnnual =
    typeof body.ctcAnnual === 'number' && Number.isFinite(body.ctcAnnual) ? body.ctcAnnual : undefined
  const reportingTo = typeof body.reportingTo === 'string' ? body.reportingTo.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''

  if (!applicationId) return NextResponse.json({ message: 'Application required.' }, { status: 400 })
  if (!employeeCode) return NextResponse.json({ message: 'Employee code required.' }, { status: 400 })
  if (!designation) return NextResponse.json({ message: 'Designation required.' }, { status: 400 })
  if (!dateOfJoining) return NextResponse.json({ message: 'Date of joining required.' }, { status: 400 })

  const app = await findApplicationById(applicationId)
  if (!app) return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  const candidate = await findCandidateById(app.candidateId)
  if (!candidate) return NextResponse.json({ message: 'Candidate not found.' }, { status: 404 })
  const role = await findRoleById(app.roleId)
  if (!role) return NextResponse.json({ message: 'Role not found.' }, { status: 404 })

  const duplicates = (await loadEmployees()).filter((e) => e.applicationId === applicationId)
  if (duplicates.length > 0) {
    return NextResponse.json(
      { message: 'An employee record already exists for this application.' },
      { status: 409 },
    )
  }
  const codeClash = (await loadEmployees()).find(
    (e) => e.employeeCode.toLowerCase() === employeeCode.toLowerCase(),
  )
  if (codeClash) {
    return NextResponse.json({ message: 'Employee code already in use.' }, { status: 409 })
  }

  const offer = (await loadOffers()).find((o) => o.applicationId === applicationId && o.status === 'Accepted')

  const now = new Date().toISOString()
  const employeeId = crypto.randomUUID()

  const payload = {
    id: employeeId,
    employeeCode,
    candidateId: candidate.id,
    applicationId,
    name: candidate.name,
    email: candidate.email,
    phone: phone || candidate.phone || undefined,
    designation,
    department: department || role.department,
    reportingTo: reportingTo || undefined,
    location: location || role.location,
    dateOfJoining,
    status: 'Active' as const,
    ctcAnnual: ctcAnnual ?? offer?.compensation.ctcAnnual,
    onboardingChecklist: defaultOnboardingChecklist(),
    createdAt: now,
    createdBy: session.email,
    auditLog: [
      {
        timestamp: now,
        user: session.email,
        action: 'employee.create',
        after: { employeeCode, designation, dateOfJoining },
      },
    ],
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'employee',
      operation: 'create',
      payload,
    })

    // Advance pipeline to Joined if not already.
    if (app.currentStage !== 'Joined') {
      const { valid } = canTransition(role, app.currentStage, 'Joined')
      if (valid) {
        await enqueueUpdate({
          queuedBy: session.email,
          entity: 'application',
          operation: 'update',
          payload: {
            id: app.id,
            operation: 'stage-transition',
            before: { currentStage: app.currentStage, stageEnteredAt: app.stageEnteredAt },
            after: { currentStage: 'Joined', stageEnteredAt: now },
            notes: `Employee record ${employeeCode} created.`,
          },
        })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, employeeId })
}
