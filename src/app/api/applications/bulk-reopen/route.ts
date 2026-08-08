import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import {
  loadApplications,
  findRoleById,
  findCandidateById,
  loadRoles,
} from '@/lib/data'
import { isTerminal } from '@/lib/pipeline'
import { isPipelineReadOnly } from '@/lib/roleStatus'
import type { Role } from '@/lib/types'

export const runtime = 'nodejs'

const MIN_REASON_LENGTH = 10

interface BulkResult {
  applied: number
  skipped: number
  errors: number
  details: Array<{
    applicationId: string
    candidateName?: string
    fromStage: string
    toStage?: string
    status: 'applied' | 'skipped' | 'error'
    message?: string
  }>
}

/**
 * Bulk reopen of candidates from terminal stages.
 *
 * Accepts { applicationIds, targetStage, reason, notifyCandidate? }. The same
 * reason is applied to every selected application (one capture in the modal,
 * many audit entries), and every per-application transition still validates:
 * source must be terminal, target must be non-terminal and present in the
 * application's role pipelineStages, role must not be read-only, and the
 * caller must be Admin / HR or the assigned recruiter for that application.
 *
 * Per-application failures are reported in details[] rather than failing the
 * whole batch (matches the bulk-transition pattern).
 */
export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })

  let body: {
    applicationIds?: unknown
    targetStage?: unknown
    reason?: unknown
    notifyCandidate?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const applicationIds = Array.isArray(body.applicationIds)
    ? body.applicationIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  if (applicationIds.length === 0) {
    return NextResponse.json({ message: 'No application IDs provided.' }, { status: 400 })
  }
  if (applicationIds.length > 200) {
    return NextResponse.json({ message: 'Bulk capped at 200 applications.' }, { status: 400 })
  }

  const targetStage = typeof body.targetStage === 'string' ? body.targetStage.trim() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const notifyCandidate = body.notifyCandidate === true

  if (!targetStage) {
    return NextResponse.json({ message: 'A target stage is required.' }, { status: 400 })
  }
  if (isTerminal(targetStage)) {
    return NextResponse.json(
      { message: 'Cannot reopen into another terminal stage.' },
      { status: 400 },
    )
  }
  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      { message: `A reason of at least ${MIN_REASON_LENGTH} characters is required.` },
      { status: 400 },
    )
  }

  const apps = await loadApplications()
  const result: BulkResult = { applied: 0, skipped: 0, errors: 0, details: [] }
  const now = new Date().toISOString()

  // Prefetched once instead of a lazy per-id cache: findRoleById is async now,
  // and this ran inside a synchronous helper. One read beats N.
  const rolesById = new Map((await loadRoles()).map((r) => [r.id, r] as const))
  function roleFor(id: string): Role | undefined {
    return rolesById.get(id)
  }

  const isAdmin = session.role === 'Admin'
  const isHr = session.role === 'HR'

  for (const id of applicationIds) {
    const app = apps.find((a) => a.id === id)
    if (!app) {
      result.errors++
      result.details.push({
        applicationId: id,
        fromStage: '(unknown)',
        status: 'error',
        message: 'Application not found.',
      })
      continue
    }
    if (!isTerminal(app.currentStage)) {
      result.skipped++
      result.details.push({
        applicationId: id,
        fromStage: app.currentStage as string,
        status: 'skipped',
        message: 'Not in a terminal stage.',
      })
      continue
    }

    if (!isAdmin && !isHr && app.createdBy !== session.email) {
      result.skipped++
      result.details.push({
        applicationId: id,
        fromStage: app.currentStage as string,
        status: 'skipped',
        message: 'Only HR / Admin or the assigned recruiter can reopen.',
      })
      continue
    }

    const role = roleFor(app.roleId)
    if (!role) {
      result.errors++
      result.details.push({
        applicationId: id,
        fromStage: app.currentStage as string,
        status: 'error',
        message: 'Role not found.',
      })
      continue
    }
    if (isPipelineReadOnly(role)) {
      result.skipped++
      result.details.push({
        applicationId: id,
        fromStage: app.currentStage as string,
        status: 'skipped',
        message: `Role ${role.title} is ${role.status}; pipeline is read-only.`,
      })
      continue
    }
    if (!role.pipelineStages.includes(targetStage)) {
      result.skipped++
      result.details.push({
        applicationId: id,
        fromStage: app.currentStage as string,
        toStage: targetStage,
        status: 'skipped',
        message: `${targetStage} is not a valid stage for ${role.title}.`,
      })
      continue
    }

    const candidate = await findCandidateById(app.candidateId)
    const composedNotes = `Reopened from ${app.currentStage} to ${targetStage}: ${reason}${
      notifyCandidate ? ' (follow-up reminder requested)' : ''
    }`

    try {
      await enqueueUpdate({
        queuedBy: session.email,
        entity: 'application',
        operation: 'update',
        payload: {
          id: app.id,
          operation: 'stage-transition',
          before: {
            currentStage: app.currentStage,
            stageEnteredAt: app.stageEnteredAt,
          },
          after: {
            currentStage: targetStage,
            stageEnteredAt: now,
          },
          notes: composedNotes,
        },
      })
      result.applied++
      result.details.push({
        applicationId: id,
        candidateName: candidate?.name,
        fromStage: app.currentStage as string,
        toStage: targetStage,
        status: 'applied',
      })
    } catch (err) {
      result.errors++
      result.details.push({
        applicationId: id,
        fromStage: app.currentStage as string,
        toStage: targetStage,
        status: 'error',
        message: err instanceof Error ? err.message : 'Queue write failed.',
      })
    }
  }

  return NextResponse.json({ ok: true, ...result })
}
