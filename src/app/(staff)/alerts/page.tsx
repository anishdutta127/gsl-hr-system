import Link from 'next/link'
import {
  loadApplications,
  loadCandidates,
  loadEmployees,
  loadInterviews,
  loadOffers,
  loadRoles,
} from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { buildAttentionFeed, groupAttention, type AttentionAction } from '@/lib/needsAttention'
import { formatRelative, formatDate } from '@/lib/format'
import { isTerminal } from '@/lib/pipeline'

export const dynamic = 'force-dynamic'

// Stagnation thresholds per stage, in days. Kept intentionally conservative:
// we'd rather nudge twice than annoy, so these thresholds mean "definitely
// past time", not "getting close".
const STAGNATION_THRESHOLDS: Record<string, { days: number; label: string }> = {
  AssessmentSent: { days: 5, label: 'Candidate has not submitted the assessment' },
  VideoSent: { days: 5, label: 'Candidate has not submitted their video' },
  HODRoundScheduled: { days: 3, label: 'HOD has not scored the interview yet' },
  HOD2RoundScheduled: { days: 3, label: 'HOD round 2 not scored yet' },
  HRRoundScheduled: { days: 3, label: 'HR has not scored the interview yet' },
  Offered: { days: 7, label: 'Offer sent but no response' },
  OfferAccepted: { days: 14, label: 'Accepted offer but docs not collected' },
  DocsCollected: { days: 21, label: 'Docs collected but not yet joined' },
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

const ACTION_HEADINGS: Record<AttentionAction, string> = {
  'review-assessment': 'Assessments awaiting review',
  'schedule-hod-round': 'Schedule HOD round',
  'schedule-hr-round': 'Schedule HR round',
  'score-interview': 'Interviews to score',
  'generate-offer': 'Offers to draft',
  'collect-docs': 'Collect joining documents',
  'activate-employee': 'Activate employee record',
}

export default async function AlertsPage() {
  const session = await requireRoles(['Admin', 'HR', 'HOD'])

  const roles = await loadRoles()
  const applications = await loadApplications()
  const candidates = await loadCandidates()
  const interviews = await loadInterviews()
  const offers = await loadOffers()
  const employees = await loadEmployees()

  const attention = buildAttentionFeed({
    session,
    applications,
    roles,
    candidates,
    interviews,
    offers,
  })
  const grouped = groupAttention(attention)

  const staleOffers = offers.filter((o) => o.status === 'Sent')
  const staleOffersShown =
    session.role === 'Admin' || session.role === 'HR' ? staleOffers : []

  const pendingActivation =
    session.role === 'Admin' || session.role === 'HR'
      ? applications.filter(
          (a) =>
            a.currentStage === 'Joined' && !employees.some((e) => e.applicationId === a.id),
        )
      : []

  // H6: surface applications stuck at the same stage past threshold.
  // HOD-scoped same as the attention feed.
  const roleById = new Map(roles.map((r) => [r.id, r] as const))
  const stagnant = applications
    .filter((a) => !isTerminal(a.currentStage))
    .filter((a) => {
      const threshold = STAGNATION_THRESHOLDS[a.currentStage as string]
      if (!threshold) return false
      return daysSince(a.stageEnteredAt) >= threshold.days
    })
    .filter((a) => {
      if (session.role !== 'HOD') return true
      const role = roleById.get(a.roleId)
      return role?.hodUserId === session.sub || role?.hodRound2UserId === session.sub
    })
    .sort((a, b) => a.stageEnteredAt.localeCompare(b.stageEnteredAt))

  const actionOrder: AttentionAction[] = [
    'review-assessment',
    'score-interview',
    'schedule-hod-round',
    'schedule-hr-round',
    'generate-offer',
    'collect-docs',
    'activate-employee',
  ]

  const total =
    attention.length + staleOffersShown.length + pendingActivation.length + stagnant.length

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Alerts</h1>
        <p className="mt-1 text-sm text-ink-2">
          Everything you owe someone a decision on.
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
          <p className="text-sm text-ink-2">No open alerts. Nothing waiting on you.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {actionOrder.map((action) => {
            const items = grouped[action]
            if (!items || items.length === 0) return null
            return (
              <section key={action}>
                <h2 className="mb-2 font-display text-lg text-ink">
                  {ACTION_HEADINGS[action]} ({items.length})
                </h2>
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                  {items.map((item) => (
                    <li key={item.applicationId}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-surface"
                      >
                        <span>
                          <span className="block font-medium text-ink">
                            {item.candidateName}
                          </span>
                          <span className="block text-xs text-ink-2">
                            {item.roleTitle} · {item.currentStage}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-ink-3 tabular">
                          {formatRelative(item.stageEnteredAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

          {staleOffersShown.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg text-ink">
                Awaiting candidate response ({staleOffersShown.length})
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                {staleOffersShown.map((o) => {
                  const candidate = candidates.find((c) => c.id === o.candidateId)
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/offers/${o.id}`}
                        className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-surface"
                      >
                        <span>
                          <span className="block font-medium text-ink">
                            {candidate?.name ?? '(unknown)'}
                          </span>
                          <span className="block text-xs text-ink-2">
                            Offer sent {o.sentAt ? formatDate(o.sentAt) : formatDate(o.createdAt)}
                          </span>
                        </span>
                        <span className="text-xs text-ink-3">Open offer →</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {stagnant.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg text-ink">
                Stagnant, past threshold ({stagnant.length})
              </h2>
              <p className="mb-2 text-xs text-ink-3">
                Candidates sitting at the same stage past the nudge threshold. Open the candidate to
                use the ghost-follow-up email template or move them along.
              </p>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                {stagnant.map((a) => {
                  const candidate = candidates.find((c) => c.id === a.candidateId)
                  const role = roleById.get(a.roleId)
                  const threshold = STAGNATION_THRESHOLDS[a.currentStage as string]
                  const days = daysSince(a.stageEnteredAt)
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/candidates/${a.candidateId}`}
                        className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-surface"
                      >
                        <span>
                          <span className="block font-medium text-ink">
                            {candidate?.name ?? '(unknown)'}
                          </span>
                          <span className="block text-xs text-ink-2">
                            {role?.title ?? 'role'} · {a.currentStage}
                            {threshold ? ` · ${threshold.label}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-ink-3 tabular">
                          {days}d
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {pendingActivation.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg text-ink">
                Joined without employee record ({pendingActivation.length})
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                {pendingActivation.map((a) => {
                  const candidate = candidates.find((c) => c.id === a.candidateId)
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/employees/new?applicationId=${a.id}`}
                        className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-surface"
                      >
                        <span>
                          <span className="block font-medium text-ink">
                            {candidate?.name ?? '(unknown)'}
                          </span>
                          <span className="block text-xs text-ink-2">
                            Joined {formatDate(a.stageEnteredAt)}
                          </span>
                        </span>
                        <span className="text-xs font-medium text-navy">Activate →</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
