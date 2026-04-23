import Link from 'next/link'
import {
  loadRoles,
  loadApplications,
  loadCandidates,
  loadEmployees,
  loadOffers,
} from '@/lib/data'
import { isTerminal } from '@/lib/pipeline'
import { formatCount } from '@/lib/format'

export default function DashboardPage() {
  const roles = loadRoles()
  const applications = loadApplications()
  const candidates = loadCandidates()
  const offers = loadOffers()
  const employees = loadEmployees()

  const openRoles = roles.filter((r) => r.status === 'Open')
  const inFlight = applications.filter((a) => !isTerminal(a.currentStage))
  const openOffers = offers.filter(
    (o) => o.status === 'Draft' || o.status === 'Generated' || o.status === 'Sent',
  )
  const now = new Date()
  const thisMonth = employees.filter((e) => {
    const joined = new Date(e.dateOfJoining)
    return (
      e.status === 'Active' &&
      joined.getFullYear() === now.getFullYear() &&
      joined.getMonth() === now.getMonth()
    )
  })

  // Stage distribution across all roles (non-terminal only)
  const stageCounts: Record<string, number> = {}
  for (const app of inFlight) {
    stageCounts[app.currentStage] = (stageCounts[app.currentStage] ?? 0) + 1
  }

  // Source distribution across all candidates
  const sourceCounts: Record<string, number> = {}
  for (const c of candidates) {
    sourceCounts[c.source] = (sourceCounts[c.source] ?? 0) + 1
  }

  // Per-role in-flight counts
  const roleCounts = openRoles.map((r) => ({
    role: r,
    count: applications.filter((a) => a.roleId === r.id && !isTerminal(a.currentStage)).length,
  }))
  roleCounts.sort((a, b) => b.count - a.count)

  return (
    <div className="container-page py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-2">
          Where hiring stands across GSL. Updates after every queue cycle (roughly every minute).
        </p>
      </div>

      <section aria-label="Key figures" className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Open roles" value={formatCount(openRoles.length)} />
        <Kpi label="Candidates in flight" value={formatCount(inFlight.length)} />
        <Kpi label="Open offers" value={formatCount(openOffers.length)} />
        <Kpi label="Joined this month" value={formatCount(thisMonth.length)} />
      </section>

      <section aria-labelledby="stage-heading" className="mb-10">
        <h2 id="stage-heading" className="mb-3 font-display text-lg text-ink">
          Candidates by stage
        </h2>
        {Object.keys(stageCounts).length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No active candidates yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-card">
            <RowFlowList
              items={Object.entries(stageCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([label, value]) => ({ label, value }))}
              max={Math.max(...Object.values(stageCounts))}
            />
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="source-heading">
          <h2 id="source-heading" className="mb-3 font-display text-lg text-ink">
            Candidates by source
          </h2>
          {Object.keys(sourceCounts).length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
              No candidates yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line bg-card">
              <RowFlowList
                items={Object.entries(sourceCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, value]) => ({ label, value }))}
                max={Math.max(...Object.values(sourceCounts))}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="role-heading">
          <h2 id="role-heading" className="mb-3 font-display text-lg text-ink">
            Open roles: in-flight count
          </h2>
          {roleCounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
              No open roles.
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
              {roleCounts.map(({ role, count }) => (
                <li key={role.id}>
                  <Link
                    href={`/roles/${role.id}`}
                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
                  >
                    <span>
                      <span className="block text-ink">{role.title}</span>
                      <span className="block text-xs text-ink-2">{role.department}</span>
                    </span>
                    <span className="tabular text-xs text-ink-2">{formatCount(count)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-10 text-xs text-ink-3">
        Deeper breakdowns (time-in-stage distribution, source conversion, withdrawal reasons) unlock
        once leadership is using this page regularly. See docs/TODOS.md entry CP6.
      </p>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-1 font-display text-2xl text-ink tabular">{value}</div>
    </div>
  )
}

function RowFlowList({
  items,
  max,
}: {
  items: Array<{ label: string; value: number }>
  max: number
}) {
  return (
    <ul className="divide-y divide-line">
      {items.map(({ label, value }) => (
        <li key={label} className="flex items-center gap-3 px-4 py-3 text-sm">
          <span className="w-40 shrink-0 text-ink">{label}</span>
          <span
            aria-hidden="true"
            className="relative h-2 flex-1 overflow-hidden rounded bg-surface"
          >
            <span
              className="absolute inset-y-0 left-0 bg-teal"
              style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
            />
          </span>
          <span className="w-12 shrink-0 text-right text-sm tabular text-ink-2">
            {formatCount(value)}
          </span>
        </li>
      ))}
    </ul>
  )
}
