import Link from 'next/link'
import { loadCandidates, loadApplications, loadRoles } from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate, formatCount } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function CandidatesPage() {
  const session = await requireRoles(['Admin', 'HR', 'HOD'])
  const allCandidates = loadCandidates()
  const allApplications = loadApplications()
  const roles = loadRoles()
  const roleById = new Map(roles.map((r) => [r.id, r] as const))

  // HOD scoping: only candidates applied to roles this HOD owns.
  const applications =
    session.role === 'HOD'
      ? allApplications.filter((a) => roleById.get(a.roleId)?.hodUserId === session.sub)
      : allApplications
  const visibleCandidateIds = new Set(applications.map((a) => a.candidateId))
  const candidates =
    session.role === 'HOD'
      ? allCandidates.filter((c) => visibleCandidateIds.has(c.id))
      : allCandidates

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Candidates</h1>
        <p className="mt-1 text-sm text-ink-2">
          Everyone in the system. Add candidates to a role from that role's detail page.
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
          <p className="text-sm text-ink-2">
            No candidates yet. Add the first candidate from a role's detail page.
          </p>
          <Link
            href="/roles"
            className="mt-4 inline-flex items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark"
          >
            Go to Roles →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
          {candidates.map((c) => {
            const apps = applications.filter((a) => a.candidateId === c.id)
            return (
              <li key={c.id} className="px-5 py-4 text-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-ink">{c.name}</div>
                    <div className="text-xs text-ink-2">
                      {c.email} · {c.source} · Added {formatDate(c.createdAt)}
                    </div>
                  </div>
                  <div className="text-xs text-ink-3 tabular">
                    {formatCount(apps.length)} {apps.length === 1 ? 'application' : 'applications'}
                  </div>
                </div>
                {apps.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {apps.map((a) => {
                      const role = roleById.get(a.roleId)
                      return (
                        <li key={a.id}>
                          <Link
                            href={`/roles/${a.roleId}`}
                            className="inline-block rounded bg-surface px-2 py-0.5 text-xs text-ink-2 hover:text-ink"
                          >
                            {role?.title ?? '(unknown role)'} · {a.currentStage}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
