import Link from 'next/link'
import {
  loadApplications,
  loadCandidates,
  loadInterviews,
  loadRoles,
} from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate, formatRelative } from '@/lib/format'
import { isTerminal } from '@/lib/pipeline'

export const dynamic = 'force-dynamic'

const AWAITING_SCORE_STAGES = new Set(['HODRoundScheduled', 'HRRoundScheduled'])

export default async function InterviewsPage() {
  const session = await requireRoles(['Admin', 'HR', 'HOD'])

  const interviews = loadInterviews()
  const applications = loadApplications()
  const candidates = loadCandidates()
  const roles = loadRoles()

  const candidateById = new Map(candidates.map((c) => [c.id, c] as const))
  const roleById = new Map(roles.map((r) => [r.id, r] as const))

  const scopedApps =
    session.role === 'HOD'
      ? applications.filter((a) => {
          const role = roleById.get(a.roleId)
          return role?.hodUserId === session.sub
        })
      : applications

  const awaiting = scopedApps.filter(
    (a) => !isTerminal(a.currentStage) && AWAITING_SCORE_STAGES.has(a.currentStage),
  )

  const scopedInterviews =
    session.role === 'HOD'
      ? interviews.filter((i) => {
          const role = roleById.get(i.roleId)
          return role?.hodUserId === session.sub
        })
      : interviews

  const recent = [...scopedInterviews]
    .sort((a, b) => (b.conductedAt ?? b.createdAt).localeCompare(a.conductedAt ?? a.createdAt))
    .slice(0, 50)

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Interviews</h1>
        <p className="mt-1 text-sm text-ink-2">
          {session.role === 'HOD'
            ? 'Candidates awaiting your score, and your recent interviews.'
            : 'Upcoming rounds and recent interviews across all roles.'}
        </p>
      </div>

      <section aria-labelledby="awaiting-heading" className="mb-10">
        <h2 id="awaiting-heading" className="mb-3 font-display text-lg text-ink">
          Awaiting score ({awaiting.length})
        </h2>
        {awaiting.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No interviews waiting on a score.
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {awaiting.map((app) => {
              const candidate = candidateById.get(app.candidateId)
              const role = roleById.get(app.roleId)
              const round = app.currentStage === 'HODRoundScheduled' ? 'HOD' : 'HR'
              return (
                <li key={app.id}>
                  <Link
                    href={`/interviews/new?applicationId=${app.id}&round=${round}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-surface"
                  >
                    <span>
                      <span className="block font-medium text-ink">
                        {candidate?.name ?? '(unknown)'}
                      </span>
                      <span className="block text-xs text-ink-2">
                        {role?.title ?? '(role)'} · {round} round ·{' '}
                        {formatRelative(app.stageEnteredAt)}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-navy">Score →</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="mb-3 font-display text-lg text-ink">
          Recent ({recent.length})
        </h2>
        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No interviews recorded yet.
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {recent.map((i) => {
              const candidate = candidateById.get(i.candidateId)
              const role = roleById.get(i.roleId)
              return (
                <li key={i.id}>
                  <Link
                    href={`/candidates/${i.candidateId}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-surface"
                  >
                    <span>
                      <span className="block font-medium text-ink">
                        {candidate?.name ?? '(unknown)'}
                      </span>
                      <span className="block text-xs text-ink-2">
                        {role?.title ?? '(role)'} · {i.round} round · {i.recommendation}
                        {i.aggregateScore != null ? ` · ${i.aggregateScore}/10` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-3 tabular">
                      {formatDate(i.conductedAt ?? i.createdAt)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
