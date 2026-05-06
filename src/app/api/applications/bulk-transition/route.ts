import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import {
  loadApplications,
  findRoleById,
  findCandidateById,
  loadUsers,
} from '@/lib/data'
import { canTransition } from '@/lib/pipeline'
import { isPipelineReadOnly } from '@/lib/roleStatus'
import {
  isHodRoundStage,
  isRejectionReason,
  type RejectionReason,
} from '@/lib/stageTransition'
import { deliverEmail } from '@/lib/mail'
import type { Role } from '@/lib/types'

export const runtime = 'nodejs'

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
 * Bulk stage transition.
 *
 * Accepts a set of application IDs and either:
 *   - { targetStage: Stage } — move each to a single explicit stage. Invalid
 *     transitions are skipped (reported in details), they don't fail the run.
 *   - { direction: 'forward' | 'backward' } — compute next/prev stage per
 *     application from its role's pipelineStages. Mixed roles supported.
 *
 * Optionally rejectionReason / rejectionNotes when targetStage = 'Rejected'.
 *
 * Each application's transition is its own queue entry (audit appends per
 * entity require it), but they all queue inside this single request — HR
 * sees one optimistic flip and one undo button covering the lot.
 */
export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })

  let body: {
    applicationIds?: unknown
    targetStage?: unknown
    direction?: unknown
    notes?: unknown
    rejectionReason?: unknown
    rejectionNotes?: unknown
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

  const targetStage = typeof body.targetStage === 'string' ? body.targetStage : ''
  const direction =
    body.direction === 'forward' || body.direction === 'backward' ? body.direction : ''
  if (!targetStage && !direction) {
    return NextResponse.json(
      { message: 'Provide targetStage or direction.' },
      { status: 400 },
    )
  }

  let rejectionReason: RejectionReason | undefined
  let rejectionNotes: string | undefined
  if (targetStage === 'Rejected') {
    if (!isRejectionReason(body.rejectionReason)) {
      return NextResponse.json(
        { message: 'A rejection reason is required.' },
        { status: 400 },
      )
    }
    rejectionReason = body.rejectionReason
    rejectionNotes =
      typeof body.rejectionNotes === 'string' && body.rejectionNotes.trim()
        ? body.rejectionNotes.trim()
        : undefined
    if (rejectionReason === 'Other' && !rejectionNotes) {
      return NextResponse.json(
        { message: 'Free-text notes are required when reason is Other.' },
        { status: 400 },
      )
    }
  }

  const notes = typeof body.notes === 'string' ? body.notes : undefined

  const apps = loadApplications()
  const result: BulkResult = { applied: 0, skipped: 0, errors: 0, details: [] }
  const now = new Date().toISOString()

  // Cache of role lookups + role-readonly checks; loadApplications already hit
  // disk once, so we only re-read role-by-id per unique role.
  const roleCache = new Map<string, Role | undefined>()
  function roleFor(id: string): Role | undefined {
    if (!roleCache.has(id)) roleCache.set(id, findRoleById(id))
    return roleCache.get(id)
  }

  // Track applications that landed on a HOD-round stage so we can notify after
  // queuing succeeds; do not block queue writes on email delivery.
  const hodNotifyTargets: Array<{ role: Role; candidateId: string; toStage: string }> = []

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

    // Resolve the candidate target for this app.
    let toStage = ''
    if (targetStage) {
      toStage = targetStage
    } else if (direction === 'forward') {
      const idx = role.pipelineStages.indexOf(app.currentStage as string)
      if (idx < 0 || idx >= role.pipelineStages.length - 1) {
        result.skipped++
        result.details.push({
          applicationId: id,
          fromStage: app.currentStage as string,
          status: 'skipped',
          message: 'No next stage available.',
        })
        continue
      }
      toStage = role.pipelineStages[idx + 1] as string
    } else if (direction === 'backward') {
      const idx = role.pipelineStages.indexOf(app.currentStage as string)
      if (idx <= 0) {
        result.skipped++
        result.details.push({
          applicationId: id,
          fromStage: app.currentStage as string,
          status: 'skipped',
          message: 'No previous stage available.',
        })
        continue
      }
      toStage = role.pipelineStages[idx - 1] as string
    }

    const valid = canTransition(role, app.currentStage, toStage)
    if (!valid.valid) {
      result.skipped++
      result.details.push({
        applicationId: id,
        fromStage: app.currentStage as string,
        toStage,
        status: 'skipped',
        message: valid.reason ?? 'Invalid transition for this application.',
      })
      continue
    }

    const after: Record<string, unknown> = {
      currentStage: toStage,
      stageEnteredAt: now,
    }
    if (rejectionReason && toStage === 'Rejected') {
      after.rejectionReason = rejectionReason
      if (rejectionNotes) after.rejectionNotes = rejectionNotes
    }

    const candidate = findCandidateById(app.candidateId)
    const composedNotes =
      rejectionReason && toStage === 'Rejected'
        ? `Rejected: ${rejectionReason}${rejectionNotes ? `. ${rejectionNotes}` : ''}${notes ? ` ${notes}` : ''}`
        : notes

    try {
      await enqueueUpdate({
        queuedBy: session.email,
        entity: 'application',
        operation: 'update',
        payload: {
          id: app.id,
          operation: 'stage-transition',
          before: { currentStage: app.currentStage, stageEnteredAt: app.stageEnteredAt },
          after,
          notes: composedNotes,
        },
      })
      result.applied++
      result.details.push({
        applicationId: id,
        candidateName: candidate?.name,
        fromStage: app.currentStage as string,
        toStage,
        status: 'applied',
      })
      if (isHodRoundStage(toStage)) {
        hodNotifyTargets.push({ role, candidateId: app.candidateId, toStage })
      }
    } catch (err) {
      result.errors++
      result.details.push({
        applicationId: id,
        fromStage: app.currentStage as string,
        toStage,
        status: 'error',
        message: err instanceof Error ? err.message : 'Queue write failed.',
      })
    }
  }

  // Fire HOD notifications best-effort.
  if (hodNotifyTargets.length > 0) {
    const users = loadUsers()
    for (const t of hodNotifyTargets) {
      try {
        const candidate = findCandidateById(t.candidateId)
        const candidateName = candidate?.name ?? 'a candidate'
        const ids =
          t.toStage === 'HOD2RoundScheduled' && t.role.hodRound2UserId
            ? [t.role.hodRound2UserId]
            : t.role.hodUserId
              ? [t.role.hodUserId]
              : []
        for (const uid of ids) {
          const hod = users.find((u) => u.id === uid)
          if (!hod?.email) continue
          await deliverEmail({
            to: hod.email,
            subject: `[GSL HR] HOD round scheduled for ${candidateName} (${t.role.title})`,
            body:
              `Hi ${hod.name?.split(' ')[0] ?? hod.name ?? 'there'},\n\n` +
              `${candidateName} is now at "${t.toStage}" for ${t.role.title}.\n\n` +
              `Open the candidate's record from the GSL HR pipeline to schedule the round and score the rubric.\n\n` +
              `Moved by ${session.email}.\n`,
            context: `hod-round-notify ${t.role.id} ${t.candidateId} ${t.toStage}`,
          })
        }
      } catch (err) {
        console.warn('HOD notification dispatch failed:', err)
      }
    }
  }

  return NextResponse.json({ ok: true, ...result })
}
