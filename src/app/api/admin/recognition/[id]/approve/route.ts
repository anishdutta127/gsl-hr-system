/*
 * Approve / reject / archive a recognition.
 *
 *   POST /api/admin/recognition/[id]/approve              -> Approved
 *   POST /api/admin/recognition/[id]/approve?action=reject -> Archived (with reason)
 *   POST /api/admin/recognition/[id]/approve?action=archive -> Archived (manual)
 *
 * "Reject" lands the record in Archived rather than removing it: HR needs
 * the audit trail of nominations that did not progress, so the deleted-
 * but-with-reason posture is wrong. Hard-delete is a separate Admin-only
 * DELETE on the parent route.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { loadRecognitions } from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { canTransition } from '@/lib/recognitionState'
import type { Recognition, RecognitionStatus } from '@/lib/types'

export const runtime = 'nodejs'

const RECOGNITIONS_PATH = 'src/data/recognitions.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

type ApiAction = 'approve' | 'reject' | 'archive'

function parseAction(url: string): ApiAction {
  try {
    const u = new URL(url)
    const a = (u.searchParams.get('action') ?? 'approve').toLowerCase()
    if (a === 'reject' || a === 'archive') return a
    return 'approve'
  } catch {
    return 'approve'
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)

  const list = loadRecognitions()
  const target = list.find((r) => r.id === params.id)
  if (!target) return bad('Recognition not found.', 404)

  const action = parseAction(request.url)

  // Centralised role + state gate.
  const transition = canTransition({
    current: target.status,
    action,
    actorRole: session.role,
  })
  if (!transition.ok || !transition.next) {
    return bad(transition.reason ?? 'Forbidden.', 403)
  }

  let reason: string | undefined
  if (action === 'reject' || action === 'archive') {
    try {
      const body = (await request.json().catch(() => ({}))) as { reason?: unknown }
      if (typeof body.reason === 'string') {
        reason = body.reason.trim() || undefined
      }
    } catch {
      // body optional
    }
    if (action === 'reject' && !reason) {
      return bad('A short reason is required when rejecting a nomination.')
    }
  }

  const nextStatus: RecognitionStatus = transition.next
  const now = new Date().toISOString()

  try {
    await atomicUpdateJson<Recognition[]>(
      RECOGNITIONS_PATH,
      (current) => {
        const arr = Array.isArray(current) ? current : []
        const next = arr.map((r) => {
          if (r.id !== params.id) return r
          const update: Recognition = {
            ...r,
            status: nextStatus,
            auditLog: [
              ...r.auditLog,
              {
                timestamp: now,
                user: session.email,
                action: `recognition.${action}`,
                before: { status: r.status },
                after: { status: nextStatus },
                notes: reason,
              },
            ],
          }
          if (action === 'approve') {
            update.approvedBy = session.email
            update.approvedAt = now
          }
          return update
        })
        return {
          next,
          commitMessage: `feat(recognition): ${action} ${params.id}`,
        }
      },
      { defaultValue: loadRecognitions() },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, status: nextStatus })
}
