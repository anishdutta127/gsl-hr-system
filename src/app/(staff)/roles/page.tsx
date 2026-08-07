import Link from 'next/link'
import { loadRoles, loadApplications } from '@/lib/data'
import { isTerminal } from '@/lib/pipeline'
import { formatCount, formatDate } from '@/lib/format'
import { RoleStatusPill } from '@/components/RoleStatusPill'
import { PendingWritesNotice } from '@/components/PendingWritesNotice'

export const dynamic = 'force-dynamic'

/**
 * Every status the board renders a section for. Anything outside this set
 * falls into the catch-all below rather than vanishing: a role whose status
 * matches no section would otherwise be invisible on every tab, with no
 * error anywhere, which is the same class of silent loss as an undrained
 * queue write.
 */
const RENDERED_STATUSES = ['Open', 'Paused', 'Draft', 'Closed', 'Archived'] as const

export default async function RolesPage({
  searchParams,
}: {
  searchParams: { archived?: string; queued?: string }
}) {
  const showArchived = searchParams.archived === '1'
  const queuedTitle =
    typeof searchParams.queued === 'string' && searchParams.queued.trim()
      ? searchParams.queued.trim().slice(0, 120)
      : null
  const allRoles = loadRoles()
  const roles = showArchived ? allRoles : allRoles.filter((r) => r.status !== 'Archived')
  const applications = loadApplications()

  const rolesByStatus = {
    Open: roles.filter((r) => r.status === 'Open'),
    Paused: roles.filter((r) => r.status === 'Paused'),
    Draft: roles.filter((r) => r.status === 'Draft'),
    Closed: roles.filter((r) => r.status === 'Closed'),
    Archived: allRoles.filter((r) => r.status === 'Archived'),
  }

  // Fail visible, not silent: any role carrying a status no section renders
  // is surfaced here so it can be found and corrected.
  const unrecognised = allRoles.filter(
    (r) => !(RENDERED_STATUSES as readonly string[]).includes(r.status),
  )

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

      {queuedTitle && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-success bg-success-bg px-4 py-3 text-sm text-ink"
        >
          <span className="font-medium">{queuedTitle}</span> was saved. It appears on this board
          once the next sync runs; use Sync now below if you need it immediately.
        </div>
      )}

      <PendingWritesNotice entity="role" noun="role" />

      {roles.length === 0 && rolesByStatus.Archived.length === 0 && unrecognised.length === 0 ? (
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
          <RoleSection title="Open" status="Open" roles={rolesByStatus.Open} applications={applications} />
          {rolesByStatus.Paused.length > 0 && (
            <RoleSection title="Paused" status="Paused" roles={rolesByStatus.Paused} applications={applications} />
          )}
          {rolesByStatus.Draft.length > 0 && (
            <RoleSection title="Draft" status="Draft" roles={rolesByStatus.Draft} applications={applications} />
          )}
          {rolesByStatus.Closed.length > 0 && (
            <RoleSection title="Closed" status="Closed" roles={rolesByStatus.Closed} applications={applications} />
          )}
          {showArchived && rolesByStatus.Archived.length > 0 && (
            <RoleSection
              title="Archived"
              status="Archived"
              roles={rolesByStatus.Archived}
              applications={applications}
            />
          )}
          {unrecognised.length > 0 && (
            <section aria-labelledby="section-unrecognised">
              <h2
                id="section-unrecognised"
                className="mb-1 font-display text-lg text-ink-2"
              >
                Needs attention ({formatCount(unrecognised.length)})
              </h2>
              <p className="mb-3 text-sm text-ink-2">
                These roles carry a status the board does not recognise, so they appear in no
                other section. Open each one and set its status.
              </p>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-warning bg-card">
                {unrecognised.map((role) => (
                  <li key={role.id}>
                    <Link
                      href={`/roles/${role.id}`}
                      className="flex items-center justify-between px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
                    >
                      <span>
                        <span className="block font-medium text-ink">{role.title}</span>
                        <span className="block text-xs text-ink-2">
                          {role.department} · {role.location} · Status: {String(role.status) || 'not set'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="mt-10 text-xs text-ink-3">
        {showArchived ? (
          <Link href="/roles" className="hover:text-ink">
            Hide archived
          </Link>
        ) : rolesByStatus.Archived.length > 0 ? (
          <Link href="/roles?archived=1" className="hover:text-ink">
            Show archived ({formatCount(rolesByStatus.Archived.length)})
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function RoleSection({
  title,
  status,
  roles,
  applications,
}: {
  title: string
  status: 'Draft' | 'Open' | 'Paused' | 'Closed' | 'Archived'
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
      <h2 id={`section-${title}`} className="mb-3 flex items-center gap-2 font-display text-lg text-ink-2">
        <RoleStatusPill status={status} /> ({formatCount(roles.length)})
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
