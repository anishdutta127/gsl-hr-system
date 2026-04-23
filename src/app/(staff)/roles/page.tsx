import Link from 'next/link'
import { loadRoles, loadApplications } from '@/lib/data'
import { isTerminal } from '@/lib/pipeline'
import { formatCount, formatDate } from '@/lib/format'

export default async function RolesPage() {
  const roles = loadRoles()
  const applications = loadApplications()

  const rolesByStatus = {
    Open: roles.filter((r) => r.status === 'Open'),
    Draft: roles.filter((r) => r.status === 'Draft'),
    Closed: roles.filter((r) => r.status === 'Closed'),
  }

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Roles</h1>
          <p className="mt-1 text-sm text-ink-2">
            Every role we're hiring for, with pipeline counts.
          </p>
        </div>
        <Link
          href="/roles/new"
          className="inline-flex items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
        >
          New role
        </Link>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
          <p className="text-sm text-ink-2">
            No roles yet. Add the first role to start your pipeline.
          </p>
          <Link
            href="/roles/new"
            className="mt-4 inline-flex items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark"
          >
            New role →
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <RoleSection title="Open" roles={rolesByStatus.Open} applications={applications} />
          {rolesByStatus.Draft.length > 0 && (
            <RoleSection title="Draft" roles={rolesByStatus.Draft} applications={applications} />
          )}
          {rolesByStatus.Closed.length > 0 && (
            <RoleSection title="Closed" roles={rolesByStatus.Closed} applications={applications} />
          )}
        </div>
      )}
    </div>
  )
}

function RoleSection({
  title,
  roles,
  applications,
}: {
  title: string
  roles: Array<{
    id: string
    title: string
    department: string
    location: string
    employmentType: string
    createdAt: string
  }>
  applications: Array<{ roleId: string; currentStage: string }>
}) {
  if (roles.length === 0) return null
  return (
    <section aria-labelledby={`section-${title}`}>
      <h2 id={`section-${title}`} className="mb-3 font-display text-lg text-ink-2">
        {title} ({formatCount(roles.length)})
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {roles.map((role) => {
          const inFlight = applications.filter(
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
                    {role.department} · {role.location} · {role.employmentType} · Created {formatDate(role.createdAt)}
                  </span>
                </span>
                <span className="text-xs text-ink-2 tabular">{formatCount(inFlight)} in flight</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
