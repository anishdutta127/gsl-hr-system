import Link from 'next/link'
import { loadCandidates, loadApplications, loadRoles } from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatCount } from '@/lib/format'
import { EMAIL_TEMPLATES } from '@/lib/emailTemplates'
import { canAcceptNewCandidates } from '@/lib/roleStatus'
import { isTerminal } from '@/lib/pipeline'
import { CandidateList, type CandidateRow } from './CandidateList'

export const dynamic = 'force-dynamic'

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: { programme?: string; q?: string; notice?: string; name?: string }
}) {
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
  let candidates =
    session.role === 'HOD'
      ? allCandidates.filter((c) => visibleCandidateIds.has(c.id))
      : allCandidates

  // Hide archived unless the filter explicitly asks for them.
  candidates = candidates.filter((c) => c.status !== 'Archived')

  const programmes = Array.from(
    new Set(candidates.flatMap((c) => c.tags?.programmes ?? [])),
  ).sort()

  const progFilter = searchParams.programme?.trim() ?? ''
  const q = searchParams.q?.trim().toLowerCase() ?? ''

  candidates = candidates.filter((c) => {
    if (progFilter && !(c.tags?.programmes ?? []).includes(progFilter)) return false
    if (q) {
      const hay = [
        c.name,
        c.email,
        c.source,
        c.searchableText ?? '',
        ...(c.tags?.programmes ?? []),
      ]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const rows: CandidateRow[] = candidates.map((c) => {
    const apps = applications.filter((a) => a.candidateId === c.id)
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      source: c.source,
      createdAt: c.createdAt,
      programmes: c.tags?.programmes ?? [],
      appCount: apps.length,
      appSummaries: apps.slice(0, 2).map((a) => ({
        roleTitle: roleById.get(a.roleId)?.title ?? 'role',
        stage: a.currentStage as string,
      })),
      hasResume: Boolean(c.resumeFilePath),
    }
  })

  const inFlightByRole = new Map<string, number>()
  for (const a of allApplications) {
    if (!isTerminal(a.currentStage)) {
      inFlightByRole.set(a.roleId, (inFlightByRole.get(a.roleId) ?? 0) + 1)
    }
  }
  const openRoleOptions = roles
    .filter(canAcceptNewCandidates)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => {
      const count = inFlightByRole.get(r.id) ?? 0
      const statusSuffix = r.status === 'Open' ? '' : ` · ${r.status}`
      const countSuffix = count > 0 ? ` · ${count} in pipeline` : ''
      return {
        id: r.id,
        label: `${r.title} · ${r.department}${statusSuffix}${countSuffix}`,
      }
    })

  const canBulk = session.role === 'Admin' || session.role === 'HR'

  const queuedNoticeName =
    searchParams.notice === 'queued' && typeof searchParams.name === 'string'
      ? searchParams.name
      : ''

  return (
    <div className="container-page py-8">
      {queuedNoticeName && (
        <div
          role="status"
          className="mb-4 rounded border border-success bg-success-bg px-3 py-2 text-sm text-ink"
        >
          {queuedNoticeName} is queued. The record appears in the pool within a few minutes once
          the sync runner picks it up.
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Candidates</h1>
          <p className="mt-1 text-sm text-ink-2">
            {formatCount(candidates.length)} of {formatCount(allCandidates.filter((c) => c.status !== 'Archived').length)} in the pool.
            Search hits names, emails, and full resume text.
          </p>
        </div>
        {canBulk && (
          <Link
            href="/candidates/import"
            className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
          >
            Quick paste-in
          </Link>
        )}
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3" role="search" aria-label="Filter candidates">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="q" className="block text-xs font-medium text-ink-2">
            Search resume text
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="skill, school, company"
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>
        <div>
          <label htmlFor="programme" className="block text-xs font-medium text-ink-2">
            Programme
          </label>
          <select
            id="programme"
            name="programme"
            defaultValue={progFilter}
            className="mt-1 block rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <option value="">All programmes</option>
            {programmes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
        >
          Apply
        </button>
        {(progFilter || q) && (
          <Link href="/candidates" className="text-xs font-medium text-ink-2 hover:text-ink">
            Clear
          </Link>
        )}
      </form>

      {canBulk ? (
        <CandidateList
          rows={rows}
          totalCount={rows.length}
          templateOptions={EMAIL_TEMPLATES.map((t) => ({ id: t.id, title: t.title }))}
          openRoleOptions={openRoleOptions}
        />
      ) : (
        // HOD view: read-only list without bulk toolbar.
        rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
            <p className="text-sm text-ink-2">No candidates match.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {rows.slice(0, 200).map((c) => (
              <li key={c.id} className="flex items-start gap-2 px-5 py-3 text-sm">
                <Link
                  href={`/candidates/${c.id}`}
                  className="flex-1 min-w-0 hover:text-navy"
                >
                  <span className="block font-medium text-ink">{c.name}</span>
                  <span className="block text-xs text-ink-2">
                    {c.email || 'no email on file'} · {c.source}
                  </span>
                </Link>
                <span className="shrink-0 flex items-center gap-2 text-xs text-ink-3 tabular">
                  {c.hasResume && (
                    <a
                      href={`/api/resumes/${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded border border-line-strong bg-card px-2 py-0.5 text-xs font-medium text-ink-2 hover:bg-surface hover:text-navy"
                    >
                      CV
                    </a>
                  )}
                  <span>
                    {c.appCount} {c.appCount === 1 ? 'app' : 'apps'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
