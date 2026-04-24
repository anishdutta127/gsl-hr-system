import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import {
  findApplicationById,
  findCandidateById,
  findRoleById,
} from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { InterviewForm } from './InterviewForm'

export const dynamic = 'force-dynamic'

export default async function NewInterviewPage({
  searchParams,
}: {
  searchParams: { applicationId?: string; round?: string }
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const applicationId = searchParams.applicationId
  if (!applicationId) notFound()
  const app = findApplicationById(applicationId)
  if (!app) notFound()
  const role = findRoleById(app.roleId)
  const candidate = findCandidateById(app.candidateId)
  if (!role || !candidate) notFound()

  // Infer round from current stage if not explicit
  let round = searchParams.round
  if (!round) {
    if (app.currentStage === 'HODRoundScheduled' || app.currentStage === 'VideoDone') round = 'HOD'
    else if (app.currentStage === 'HRRoundScheduled' || app.currentStage === 'HODRoundDone') round = 'HR'
    else round = 'HOD'
  }

  const hasRubric = role.rubric && role.rubric.length > 0

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href={`/candidates/${candidate.id}`} className="hover:text-ink">
          {candidate.name}
        </Link>{' '}
        / Score {round} interview
      </div>
      <h1 className="font-display text-2xl text-ink">{round} interview: {candidate.name}</h1>
      <p className="mt-1 text-sm text-ink-2">
        {role.title} · {role.department} · Current stage: {app.currentStage}
      </p>

      {!hasRubric ? (
        <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-card p-6 text-sm">
          <p className="text-ink">
            This role doesn't have a rubric configured yet.
          </p>
          <p className="mt-2 text-ink-2">
            Add at least one criterion before scoring. Without a rubric you can still leave freeform
            notes and a recommendation.
          </p>
          <Link
            href={`/roles/${role.id}/rubric`}
            className="mt-4 inline-flex items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark"
          >
            Configure rubric →
          </Link>
        </div>
      ) : null}

      <InterviewForm application={app} role={role} round={round} />
    </div>
  )
}
