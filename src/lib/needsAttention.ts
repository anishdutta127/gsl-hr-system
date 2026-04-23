/*
 * Needs-attention feed: what this user should look at right now.
 * Grouped by action type. Pure function over loaded entities.
 *
 * Decision Pass 1 (from phase-1-design.md, Shruti-flagged): Home defaults
 * to this feed. If observation post-launch shows Shruti deep-focuses on
 * one role, we flip the default to role-Kanban.
 */

import type {
  Application,
  Role,
  Candidate,
  Interview,
  Offer,
  SessionClaims,
  Stage,
} from './types'
import { isTerminal } from './pipeline'

export type AttentionAction =
  | 'review-assessment'
  | 'schedule-hod-round'
  | 'schedule-hr-round'
  | 'score-interview'
  | 'generate-offer'
  | 'collect-docs'
  | 'activate-employee'

export interface AttentionItem {
  action: AttentionAction
  label: string
  applicationId: string
  candidateId: string
  roleId: string
  candidateName: string
  roleTitle: string
  currentStage: Stage
  stageEnteredAt: string
  href: string
}

interface Context {
  session: SessionClaims
  applications: Application[]
  roles: Role[]
  candidates: Candidate[]
  interviews: Interview[]
  offers: Offer[]
}

const STAGE_TO_ACTION: Partial<Record<string, { action: AttentionAction; label: string; roles: Array<'Admin' | 'HR' | 'HOD' | 'Leadership'> }>> = {
  AssessmentDone: {
    action: 'review-assessment',
    label: 'Review assessment',
    roles: ['Admin', 'HR'],
  },
  VideoDone: {
    action: 'schedule-hod-round',
    label: 'Schedule HOD round',
    roles: ['Admin', 'HR'],
  },
  HODRoundScheduled: {
    action: 'score-interview',
    label: 'Score HOD interview',
    roles: ['Admin', 'HOD'],
  },
  HODRoundDone: {
    action: 'schedule-hr-round',
    label: 'Schedule HR round',
    roles: ['Admin', 'HR'],
  },
  HRRoundScheduled: {
    action: 'score-interview',
    label: 'Score HR interview',
    roles: ['Admin', 'HR'],
  },
  HRRoundDone: {
    action: 'generate-offer',
    label: 'Generate offer letter',
    roles: ['Admin', 'HR'],
  },
  OfferAccepted: {
    action: 'collect-docs',
    label: 'Collect joining documents',
    roles: ['Admin', 'HR'],
  },
  DocsCollected: {
    action: 'activate-employee',
    label: 'Activate employee record',
    roles: ['Admin', 'HR'],
  },
}

export function buildAttentionFeed(ctx: Context): AttentionItem[] {
  const { session, applications, roles, candidates } = ctx
  const roleById = new Map(roles.map((r) => [r.id, r] as const))
  const candidateById = new Map(candidates.map((c) => [c.id, c] as const))

  const items: AttentionItem[] = []

  for (const app of applications) {
    if (isTerminal(app.currentStage)) continue
    const mapping = STAGE_TO_ACTION[app.currentStage]
    if (!mapping) continue
    if (!mapping.roles.includes(session.role)) continue

    const role = roleById.get(app.roleId)
    if (!role) continue
    const candidate = candidateById.get(app.candidateId)
    if (!candidate) continue

    // HOD-scoped: only show items for roles this HOD owns
    if (session.role === 'HOD') {
      if (role.hodUserId !== session.sub) continue
    }

    items.push({
      action: mapping.action,
      label: mapping.label,
      applicationId: app.id,
      candidateId: candidate.id,
      roleId: role.id,
      candidateName: candidate.name,
      roleTitle: role.title,
      currentStage: app.currentStage,
      stageEnteredAt: app.stageEnteredAt,
      href: `/candidates/${candidate.id}`,
    })
  }

  items.sort((a, b) => a.stageEnteredAt.localeCompare(b.stageEnteredAt))
  return items
}

export function groupAttention(items: AttentionItem[]): Record<AttentionAction, AttentionItem[]> {
  const out = {} as Record<AttentionAction, AttentionItem[]>
  for (const item of items) {
    const list = out[item.action] ?? []
    list.push(item)
    out[item.action] = list
  }
  return out
}
