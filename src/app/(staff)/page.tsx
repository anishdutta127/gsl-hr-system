import Link from 'next/link'
import { loadRoles, loadCandidates, loadApplications } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { isTerminal } from '@/lib/pipeline'
import { formatCount } from '@/lib/format'

export default async function HomePage() {
  const session = await getCurrentSession()
  const roles = loadRoles()
  const openRoles = roles.filter((r) => r.status === 'Open')
  const applications = loadApplications()
  const inFlight = applications.filter((a) => !isTerminal(a.currentStage))
  const candidates = loadCandidates()

  const firstName = session?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="container-page py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-ink">Good day, {firstName}.</h1>
        <p className="mt-1 text-sm text-ink-2">
          Here's where hiring stands this morning.
        </p>
      </div>

      <section aria-label="Key figures" className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Open roles" value={formatCount(openRoles.length)} />
        <Kpi label="Candidates in flight" value={formatCount(inFlight.length)} />
        <Kpi label="Total candidates" value={formatCount(candidates.length)} />
        <Kpi label="Total roles" value={formatCount(roles.length)} />
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-1 font-display text-2xl text-ink tabular">{value}</div>
    </div>
  )
}
