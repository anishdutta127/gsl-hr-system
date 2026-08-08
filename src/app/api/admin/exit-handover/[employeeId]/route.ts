/*
 * Exit handover record - save checklist + template choice + review.
 *
 *   GET   /api/admin/exit-handover/[employeeId]                  - read (returns empty shell if missing)
 *   PUT   /api/admin/exit-handover/[employeeId]                  - upsert checklist + template
 *   POST  /api/admin/exit-handover/[employeeId]?action=review    - mark HR-reviewed
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  canEditHandover,
  canReviewHandover,
  emptyHandover,
  loadExitHandovers,
} from '@/lib/exitHandover'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import {
  HANDOVER_TEMPLATE_KINDS,
  type ExitHandover,
  type HandoverAccessItem,
  type HandoverKeyContact,
  type HandoverKnowledgeSession,
  type HandoverPendingTask,
  type HandoverTemplateKind,
} from '@/lib/types'

export const runtime = 'nodejs'

const HANDOVERS_PATH = 'src/data/exit_handovers.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface UpsertBody {
  templateUsed?: HandoverTemplateKind | null
  checklist?: {
    pendingTasks?: HandoverPendingTask[]
    keyContacts?: HandoverKeyContact[]
    accessRevocation?: HandoverAccessItem[]
    itAssetsReturned?: string[]
    knowledgeTransfer?: HandoverKnowledgeSession[]
  }
}

interface ReviewBody {
  reviewNotes?: string
}

export async function GET(_request: Request, { params }: { params: { employeeId: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Unauthorised.', 401)
  const employee = await findEmployeeById(params.employeeId)
  if (!employee) return bad('Employee not found.', 404)
  // All staff roles can view; HOD scoping is enforced at the page layer
  // because the handover doc itself is not confidential the way exit
  // interviews are.
  const existing = loadExitHandovers().find((h) => h.employeeId === params.employeeId)
  return NextResponse.json({ handover: existing ?? null })
}

export async function PUT(request: Request, { params }: { params: { employeeId: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Unauthorised.', 401)
  const employee = await findEmployeeById(params.employeeId)
  if (!employee) return bad('Employee not found.', 404)
  if (!canEditHandover(session, { reportingManagerId: employee.reportingManagerId ?? null })) {
    return bad('Forbidden.', 403)
  }

  let body: UpsertBody
  try {
    body = (await request.json()) as UpsertBody
  } catch {
    return bad('Body must be JSON.')
  }
  if (body.templateUsed && !HANDOVER_TEMPLATE_KINDS.includes(body.templateUsed)) {
    return bad('Invalid templateUsed.')
  }

  const now = new Date().toISOString()

  await atomicUpdateJson<ExitHandover[]>(
    HANDOVERS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((h) => h.employeeId === params.employeeId)
      const base = idx >= 0 ? list[idx]! : emptyHandover(params.employeeId, now)
      const before = idx >= 0 ? snapshotChecklist(base) : null
      const updated: ExitHandover = {
        ...base,
        templateUsed: body.templateUsed !== undefined ? body.templateUsed : base.templateUsed,
        checklist: {
          pendingTasks: body.checklist?.pendingTasks ?? base.checklist.pendingTasks,
          keyContacts: body.checklist?.keyContacts ?? base.checklist.keyContacts,
          accessRevocation: body.checklist?.accessRevocation ?? base.checklist.accessRevocation,
          itAssetsReturned: body.checklist?.itAssetsReturned ?? base.checklist.itAssetsReturned,
          knowledgeTransfer: body.checklist?.knowledgeTransfer ?? base.checklist.knowledgeTransfer,
        },
        updatedAt: now,
        auditLog: [
          ...base.auditLog,
          {
            timestamp: now,
            user: session!.email,
            action: idx >= 0 ? 'exit-handover.update' : 'exit-handover.create',
            before,
            after: snapshotChecklist({ ...base, templateUsed: body.templateUsed ?? base.templateUsed }),
          },
        ],
      }
      const next = idx >= 0 ? [...list.slice(0, idx), updated, ...list.slice(idx + 1)] : [...list, updated]
      return {
        next,
        commitMessage: `feat(exit-handover): ${idx >= 0 ? 'update' : 'create'} for ${params.employeeId}`,
      }
    },
    { defaultValue: [] as ExitHandover[] },
  )
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request, { params }: { params: { employeeId: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Unauthorised.', 401)
  const url = new URL(request.url)
  if (url.searchParams.get('action') !== 'review') return bad('Unknown action.')

  if (!canReviewHandover(session)) return bad('Only HR or Admin can mark reviewed.', 403)

  let body: ReviewBody = {}
  try {
    body = (await request.json()) as ReviewBody
  } catch {
    // empty body OK
  }

  const now = new Date().toISOString()
  let touched = false
  let needsDoc = false

  await atomicUpdateJson<ExitHandover[]>(
    HANDOVERS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((h) => {
        if (h.employeeId !== params.employeeId) return h
        if (!h.document) {
          needsDoc = true
          return h
        }
        touched = true
        return {
          ...h,
          reviewedAt: now,
          reviewedBy: session!.email,
          reviewNotes: body.reviewNotes ?? h.reviewNotes,
          updatedAt: now,
          auditLog: [
            ...h.auditLog,
            {
              timestamp: now,
              user: session!.email,
              action: 'exit-handover.review',
              after: { reviewedBy: session!.email, reviewNotes: body.reviewNotes ?? h.reviewNotes },
            },
          ],
        }
      })
      return { next, commitMessage: `feat(exit-handover): review ${params.employeeId}` }
    },
    { defaultValue: [] as ExitHandover[] },
  )
  if (needsDoc) return bad('Cannot review until a handover document is uploaded.')
  if (!touched) return bad('Handover not found.', 404)
  return NextResponse.json({ ok: true })
}

function snapshotChecklist(h: ExitHandover): unknown {
  return {
    templateUsed: h.templateUsed,
    counts: {
      pendingTasks: h.checklist.pendingTasks.length,
      keyContacts: h.checklist.keyContacts.length,
      accessRevocation: h.checklist.accessRevocation.length,
      itAssetsReturned: h.checklist.itAssetsReturned.length,
      knowledgeTransfer: h.checklist.knowledgeTransfer.length,
    },
  }
}
