import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { findApplicationById, findRoleById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { inferNextStage } from '@/lib/rubric'
import { canTransition } from '@/lib/pipeline'
import type { InterviewScore } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })

  let body: {
    applicationId?: unknown
    round?: unknown
    scores?: unknown
    notes?: unknown
    recommendation?: unknown
    aggregateScore?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : ''
  const round = typeof body.round === 'string' ? body.round : 'HOD'
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 5000) : ''
  const recommendation =
    body.recommendation === 'proceed' || body.recommendation === 'hold' || body.recommendation === 'reject'
      ? body.recommendation
      : 'proceed'
  const aggregateScore = typeof body.aggregateScore === 'number' ? body.aggregateScore : undefined
  const scores: InterviewScore[] = Array.isArray(body.scores)
    ? body.scores
        .filter(
          (s): s is InterviewScore =>
            typeof s === 'object' &&
            s !== null &&
            typeof (s as Record<string, unknown>).criterionId === 'string',
        )
        .map((s) => ({
          criterionId: (s as InterviewScore).criterionId,
          value: (s as InterviewScore).value,
        }))
    : []

  if (!applicationId) return NextResponse.json({ message: 'Application required.' }, { status: 400 })

  const app = await findApplicationById(applicationId)
  if (!app) return NextResponse.json({ message: 'Application not found.' }, { status: 404 })
  const role = await findRoleById(app.roleId)
  if (!role) return NextResponse.json({ message: 'Role not found.' }, { status: 404 })

  // HOD scoping: only the role's assigned HOD (or Admin / HR) may score HOD
  if (round === 'HOD' && session.role === 'HOD' && role.hodUserId !== session.sub) {
    return NextResponse.json({ message: 'You do not own this role.' }, { status: 403 })
  }
  // HOD round 2 (Academics): only the role's second HOD.
  if (round === 'HOD2' && session.role === 'HOD' && role.hodRound2UserId !== session.sub) {
    return NextResponse.json({ message: 'You do not own round 2 for this role.' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const interviewId = crypto.randomUUID()

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'interview',
      operation: 'create',
      payload: {
        id: interviewId,
        applicationId,
        roleId: role.id,
        candidateId: app.candidateId,
        round,
        interviewerUserId: session.sub,
        conductedAt: now,
        scores,
        notes,
        recommendation,
        aggregateScore,
        createdAt: now,
        createdBy: session.email,
        auditLog: [
          {
            timestamp: now,
            user: session.email,
            action: 'interview.create',
            after: { round, recommendation, aggregateScore },
          },
        ],
      },
    })

    const next = inferNextStage(round, recommendation)
    if (next) {
      const { valid } = canTransition(role, app.currentStage, next.stage)
      if (valid) {
        await enqueueUpdate({
          queuedBy: session.email,
          entity: 'application',
          operation: 'update',
          payload: {
            id: app.id,
            operation: 'stage-transition',
            before: { currentStage: app.currentStage, stageEnteredAt: app.stageEnteredAt },
            after: { currentStage: next.stage, stageEnteredAt: now },
            notes: `${round} interview ${recommendation} → ${next.stage}${
              aggregateScore != null ? ` (${aggregateScore}/10)` : ''
            }.`,
          },
        })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, interviewId })
}
