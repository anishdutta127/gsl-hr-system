import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  findRoleById,
  loadApplications,
  loadCandidates,
} from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { matchCandidatesToRole } from '@/lib/candidateMatch'
import { MatchActions } from './MatchActions'

export const dynamic = 'force-dynamic'

export default async function RoleMatchPage({ params }: { params: { id: string } }) {
  await requireRoles(['Admin', 'HR'])
  const role = findRoleById(params.id)
  if (!role) notFound()

  const matches = matchCandidatesToRole(role, loadCandidates(), loadApplications())
  const top = matches.slice(0, 20)

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href={`/roles/${role.id}`} className="hover:text-ink">
          {role.title}
        </Link>{' '}
        / Find matches
      </div>
      <h1 className="font-display text-2xl text-ink">Candidates matching {role.title}</h1>
      <p className="mt-1 text-sm text-ink-2">
        Scored by programme-tag overlap, resume keyword hits against the role description,
        and department convention. Top 20 shown below. Select some and bulk-add them to this
        role's pipeline.
      </p>

      {top.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-card p-8 text-center text-sm text-ink-2">
          No candidates in the pool match this role yet. Try loosening the role description, or
          add candidates from <Link href="/candidates" className="text-navy hover:underline">/candidates</Link>.
        </div>
      ) : (
        <MatchActions
          roleId={role.id}
          roleTitle={role.title}
          matches={top.map((m) => ({
            id: m.candidate.id,
            name: m.candidate.name,
            email: m.candidate.email,
            score: m.score,
            reasons: m.reasons,
            alreadyInPipeline: m.alreadyInPipeline,
            programmes: m.candidate.tags?.programmes ?? [],
          }))}
        />
      )}
    </div>
  )
}
