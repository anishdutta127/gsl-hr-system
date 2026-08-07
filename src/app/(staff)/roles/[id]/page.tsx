import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  findRoleById,
  loadApplications,
  loadApplicationsForRole,
  loadOffers,
  loadRoles,
  loadUsers,
} from '@/lib/data'
import { isTerminal, orderedStages } from '@/lib/pipeline'
import { canAcceptNewCandidates, isPubliclyVisible } from '@/lib/roleStatus'
import { Kanban } from '@/components/kanban/Kanban'
import { parseFiltersFromQuery } from '@/lib/kanbanFilters'
import { formatDate } from '@/lib/format'
import { requireRoles } from '@/lib/guards'
import { RoleStatusPanel } from './RoleStatusPanel'
import { RoleDescriptionEdit } from './RoleDescriptionEdit'
import { RoleDetailsEdit } from './RoleDetailsEdit'
import type { CurrentMembership } from '@/components/PipelineActions'

export default async function RoleDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { filters?: string | string[] }
}) {
  const session = await requireRoles(['Admin', 'HR', 'HOD', 'Leadership'])
  const role = findRoleById(params.id)
  if (!role) notFound()
  const applications = loadApplicationsForRole(role.id)
  const stages = orderedStages(role)
  const careersVisible = isPubliclyVisible(role)
  const canManageStatus = session.role === 'Admin' || session.role === 'HR'

  // Hiring-manager picker options for the details editor. Active staff who
  // can own a role: HODs plus Admin/HR (small org, people wear both hats).
  const hodOptions = loadUsers()
    .filter((u) => u.active && (u.role === 'HOD' || u.role === 'Admin' || u.role === 'HR'))
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const activeCandidates = applications.filter((a) => !isTerminal(a.currentStage)).length
  const activeOffers = loadOffers().filter(
    (o) => o.roleId === role.id && !['Accepted', 'Declined', 'Withdrawn'].includes(o.status),
  ).length

  // Side panel needs: every other application this candidate is in (so Move's
  // source dropdown and the Add destination filter line up), plus the list of
  // open roles HR can move/add into. Loading happens once on the server so the
  // panel renders instantly.
  const candidateIdsInRole = new Set(applications.map((a) => a.candidateId))
  const allRoles = loadRoles()
  const allRolesById = new Map(allRoles.map((r) => [r.id, r] as const))
  const allApps = loadApplications()
  const membershipsByCandidate: Record<string, CurrentMembership[]> = {}
  for (const a of allApps) {
    if (!candidateIdsInRole.has(a.candidateId)) continue
    const list = membershipsByCandidate[a.candidateId] ?? []
    list.push({
      applicationId: a.id,
      roleId: a.roleId,
      roleTitle: allRolesById.get(a.roleId)?.title ?? '(role removed)',
      currentStage: a.currentStage as string,
    })
    membershipsByCandidate[a.candidateId] = list
  }
  const openRoleOptions = allRoles
    .filter((r) => canAcceptNewCandidates(r))
    .map((r) => ({ id: r.id, label: `${r.title} (${r.department})` }))
  const canEdit = session.role === 'Admin' || session.role === 'HR'

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="border-b border-line bg-card px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <Link href="/roles" className="hover:text-ink">
                Roles
              </Link>
              <span>/</span>
              <span>{role.title}</span>
            </div>
            <h1 className="mt-1 font-display text-xl text-ink">{role.title}</h1>
            <p className="mt-1 text-sm text-ink-2">
              {role.department} · {role.location} · {role.employmentType} · Created{' '}
              {formatDate(role.createdAt)}
            </p>
            <RoleStatusPanel
              role={role}
              activeCandidates={activeCandidates}
              activeOffers={activeOffers}
              canManageStatus={canManageStatus}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {careersVisible && (
              <Link
                href={`/careers/${role.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
              >
                View on careers page
              </Link>
            )}
            {canManageStatus && <RoleDetailsEdit role={role} hodOptions={hodOptions} />}
            {canManageStatus && (
              <RoleDescriptionEdit roleId={role.id} initialDescription={role.description ?? ''} />
            )}
            <Link
              href={`/roles/${role.id}/match`}
              className="inline-flex items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
            >
              Find matches
            </Link>
            <Link
              href={`/roles/${role.id}/add-candidate`}
              className="inline-flex items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
            >
              Add candidate
            </Link>
          </div>
        </div>
      </div>

      <Kanban
        role={role}
        applications={applications}
        stages={stages}
        membershipsByCandidate={membershipsByCandidate}
        openRoles={openRoleOptions}
        canEdit={canEdit}
        currentUserEmail={session.email}
        initialFilters={parseFiltersFromQuery(searchParams?.filters)}
      />
    </div>
  )
}
