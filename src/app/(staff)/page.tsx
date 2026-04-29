import Link from 'next/link'
import {
  loadRoles,
  loadCandidates,
  loadApplications,
  loadInterviews,
  loadOffers,
} from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { isTerminal } from '@/lib/pipeline'
import { formatCount, formatRelative } from '@/lib/format'
import { buildAttentionFeed, groupAttention, type AttentionAction } from '@/lib/needsAttention'

const ACTION_HEADINGS: Record<AttentionAction, string> = {
  'review-assessment': 'Review completed assessments',
  'schedule-hod-round': 'Schedule HOD rounds',
  'schedule-hr-round': 'Schedule HR rounds',
  'score-interview': 'Score pending interviews',
  'generate-offer': 'Draft offers',
  'collect-docs': 'Collect joining documents',
  'activate-employee': 'Activate new joiners',
}

export default async function HomePage() {
  const session = await getCurrentSession()
  if (!session) return null

  const roles = loadRoles()
  const openRoles = roles.filter((r) => r.status === 'Open')
  const applications = loadApplications()
  const candidates = loadCandidates()
  const interviews = loadInterviews()
  const offers = loadOffers()
  const inFlight = applications.filter((a) => !isTerminal(a.currentStage))

  const attention = buildAttentionFeed({
    session,
    applications,
    roles,
    candidates,
    interviews,
    offers,
  })
  const grouped = groupAttention(attention)
  const actionOrder: AttentionAction[] = [
    'review-assessment',
    'score-interview',
    'schedule-hod-round',
    'schedule-hr-round',
    'generate-offer',
    'collect-docs',
    'activate-employee',
  ]

  const firstName = session.name?.split(' ')[0] ?? 'there'

  return (
    <div className="container-page py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-ink">Good day, {firstName}.</h1>
        <p className="mt-1 text-sm text-ink-2">
          Here's where hiring stands this morning.
        </p>
      </div>

      <section aria-label="Key figures" className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi
          label="Needs your attention"
          value={formatCount(attention.length)}
          tint={attention.length > 0 ? 'warning' : 'neutral'}
        />
        <Kpi label="Open roles" value={formatCount(openRoles.length)} tint="success" />
        <Kpi label="Candidates in flight" value={formatCount(inFlight.length)} tint="info" />
        <Kpi label="Total candidates" value={formatCount(candidates.length)} tint="neutral" />
      </section>

      <section aria-labelledby="attention-heading" className="mb-10">
        <h2 id="attention-heading" className="mb-3 font-display text-lg text-ink">
          Needs your attention
        </h2>
        {attention.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
            <p className="text-sm text-ink-2">
              Nothing waiting on you right now. Open a role to review its pipeline, or add a new
              candidate.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {actionOrder.map((action) => {
              const items = grouped[action]
              if (!items || items.length === 0) return null
              return (
                <div key={action}>
                  <h3 className="mb-2 text-sm font-medium text-ink-2">
                    {ACTION_HEADINGS[action]} ({items.length})
                  </h3>
                  <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                    {items.slice(0, 8).map((item) => (
                      <li key={item.applicationId}>
                        <Link
                          href={item.href}
                          className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
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
                    {items.length > 8 && (
                      <li className="px-5 py-2 text-xs text-ink-3">
                        +{items.length - 8} more.
                      </li>
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="open-roles-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="open-roles-heading" className="font-display text-lg text-ink">
            Open roles
          </h2>
          <Link
            href="/roles/new"
            className="inline-flex items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
          >
            New role
          </Link>
        </div>

        {openRoles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
            <p className="text-sm text-ink-2">
              No open roles yet. Add the first role to start your pipeline.
            </p>
            <Link
              href="/roles/new"
              className="mt-4 inline-flex items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
            >
              New role →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {openRoles.map((role) => {
              const count = applications.filter(
                (a) => a.roleId === role.id && !isTerminal(a.currentStage),
              ).length
              return (
                <li key={role.id}>
                  <Link
                    href={`/roles/${role.id}`}
                    className="flex items-center justify-between px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
                  >
                    <span>
                      <span className="block font-medium text-ink">{role.title}</span>
                      <span className="block text-xs text-ink-2">
                        {role.department} · {role.location}
                      </span>
                    </span>
                    <span className="text-xs text-ink-2">
                      {formatCount(count)} in flight
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

type KpiTint = 'success' | 'warning' | 'info' | 'neutral'

const KPI_TINT_CLASSES: Record<KpiTint, string> = {
  success: 'border-success bg-success-bg/50',
  warning: 'border-warning bg-warning-bg',
  info: 'border-navy/30 bg-navy-light/40',
  neutral: 'border-line bg-card',
}

function Kpi({ label, value, tint = 'neutral' }: { label: string; value: string; tint?: KpiTint }) {
  return (
    <div className={`rounded-lg border p-4 ${KPI_TINT_CLASSES[tint]}`}>
      <div className="text-xs uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-1 font-display text-2xl text-ink tabular">{value}</div>
    </div>
  )
}
