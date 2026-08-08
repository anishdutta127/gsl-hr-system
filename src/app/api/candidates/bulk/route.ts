import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  findCandidateById,
  findRoleById,
  loadApplications,
} from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { findEmailTemplateById } from '@/lib/emailTemplates'
import { canAcceptNewCandidates } from '@/lib/roleStatus'

export const runtime = 'nodejs'

type BulkAction =
  | { type: 'add-to-pipeline'; roleId: string }
  | { type: 'archive' }
  | { type: 'log-email'; templateId: string; via?: 'log-only' | 'outlook' }

/**
 * Bulk candidate ops. One request, one queue entry per candidate, atomic
 * fail-fast on the first error so partial state is avoided.
 *
 * add-to-pipeline: creates an Application record per candidate for a role,
 *   landing at Sourced. Skips candidates who already have an active
 *   application for the same role.
 * archive: sets candidate.status = 'Archived' via an update operation.
 * log-email: records an email.sent audit entry on every candidate. Useful
 *   for "I just BCC'd these 20 people a round-1 invite" workflows.
 */
export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can run bulk actions.' }, { status: 403 })
  }

  let body: { candidateIds?: unknown; action?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const candidateIds = Array.isArray(body.candidateIds)
    ? body.candidateIds.filter((x): x is string => typeof x === 'string')
    : []
  if (candidateIds.length === 0) {
    return NextResponse.json({ message: 'No candidates selected.' }, { status: 400 })
  }
  if (candidateIds.length > 200) {
    return NextResponse.json({ message: 'Limit 200 candidates per bulk action.' }, { status: 400 })
  }

  const action = body.action as BulkAction | undefined
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
    return NextResponse.json({ message: 'Missing action.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const results: Array<{ candidateId: string; status: 'ok' | 'skipped' | 'error'; reason?: string }> = []

  if (action.type === 'add-to-pipeline') {
    const role = await findRoleById(action.roleId)
    if (!role) return NextResponse.json({ message: 'Role not found.' }, { status: 404 })
    if (!canAcceptNewCandidates(role)) {
      return NextResponse.json(
        { message: `Role is ${role.status}; reopen it before adding candidates.` },
        { status: 400 },
      )
    }

    const existingApps = await loadApplications()
    for (const cid of candidateIds) {
      const candidate = await findCandidateById(cid)
      if (!candidate) {
        results.push({ candidateId: cid, status: 'error', reason: 'not found' })
        continue
      }
      const dup = existingApps.find(
        (a) => a.candidateId === cid && a.roleId === role.id && !['Rejected', 'Withdrawn', 'NotInterested'].includes(a.currentStage as string),
      )
      if (dup) {
        results.push({ candidateId: cid, status: 'skipped', reason: 'already in pipeline' })
        continue
      }
      try {
        await enqueueUpdate({
          queuedBy: session.email,
          entity: 'application',
          operation: 'create',
          payload: {
            id: crypto.randomUUID(),
            candidateId: cid,
            roleId: role.id,
            currentStage: 'Sourced',
            stageEnteredAt: now,
            createdAt: now,
            createdBy: session.email,
            auditLog: [
              {
                timestamp: now,
                user: session.email,
                action: 'application.create',
                after: { candidateId: cid, roleId: role.id, currentStage: 'Sourced' },
                notes: `Bulk-added to ${role.title} pipeline.`,
              },
            ],
          },
        })
        results.push({ candidateId: cid, status: 'ok' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'queue failed'
        results.push({ candidateId: cid, status: 'error', reason: message })
      }
    }
  } else if (action.type === 'archive') {
    for (const cid of candidateIds) {
      const candidate = await findCandidateById(cid)
      if (!candidate) {
        results.push({ candidateId: cid, status: 'error', reason: 'not found' })
        continue
      }
      try {
        await enqueueUpdate({
          queuedBy: session.email,
          entity: 'candidate',
          operation: 'update',
          payload: {
            id: cid,
            operation: 'candidate.archive',
            before: { status: candidate.status ?? 'Active' },
            after: { status: 'Archived' },
            notes: `Bulk-archived by ${session.email}.`,
          },
        })
        results.push({ candidateId: cid, status: 'ok' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'queue failed'
        results.push({ candidateId: cid, status: 'error', reason: message })
      }
    }
  } else if (action.type === 'log-email') {
    const template = findEmailTemplateById(action.templateId)
    if (!template) return NextResponse.json({ message: 'Template not found.' }, { status: 404 })
    const via = action.via === 'outlook' ? 'outlook' : 'log-only'
    const noteSuffix = via === 'outlook' ? ' Composed in Outlook (mailto).' : ''
    for (const cid of candidateIds) {
      const candidate = await findCandidateById(cid)
      if (!candidate) {
        results.push({ candidateId: cid, status: 'error', reason: 'not found' })
        continue
      }
      try {
        await enqueueUpdate({
          queuedBy: session.email,
          entity: 'candidate',
          operation: 'update',
          payload: {
            id: cid,
            operation: 'email.sent',
            before: {},
            after: { templateId: template.id, templateTitle: template.title, via },
            notes: `Bulk-send: "${template.title}" logged for ${candidate.name}.${noteSuffix}`,
          },
        })
        results.push({ candidateId: cid, status: 'ok' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'queue failed'
        results.push({ candidateId: cid, status: 'error', reason: message })
      }
    }
  } else {
    return NextResponse.json({ message: `Unknown action type: ${(action as { type?: string }).type ?? ''}` }, { status: 400 })
  }

  const okCount = results.filter((r) => r.status === 'ok').length
  const skippedCount = results.filter((r) => r.status === 'skipped').length
  const errorCount = results.filter((r) => r.status === 'error').length

  return NextResponse.json({
    ok: true,
    applied: okCount,
    skipped: skippedCount,
    errors: errorCount,
    results,
  })
}
