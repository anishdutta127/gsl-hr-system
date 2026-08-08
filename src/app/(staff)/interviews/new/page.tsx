import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import {
  findApplicationById,
  findCandidateById,
  findRoleById,
  loadApplications,
  loadInterviews,
  loadRoles,
} from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate } from '@/lib/format'
import { InterviewForm } from './InterviewForm'

export const dynamic = 'force-dynamic'

export default async function NewInterviewPage({
  searchParams,
}: {
  searchParams: { applicationId?: string; round?: string }
}) {
  const session = await requireRoles(['Admin', 'HR', 'HOD'])

  const applicationId = searchParams.applicationId
  if (!applicationId) notFound()
  const app = await findApplicationById(applicationId)
  if (!app) notFound()
  const role = await findRoleById(app.roleId)
  const candidate = await findCandidateById(app.candidateId)
  if (!role || !candidate) notFound()

  // Infer round from current stage if not explicit
  let round = searchParams.round
  if (!round) {
    if (app.currentStage === 'HODRoundScheduled' || app.currentStage === 'VideoDone') round = 'HOD'
    else if (app.currentStage === 'HOD2RoundScheduled' || app.currentStage === 'HODRoundDone') {
      // On an Academics pipeline (hodRound2UserId set), HODRoundDone routes to round 2.
      round = role.hodRound2UserId ? 'HOD2' : 'HR'
    } else if (app.currentStage === 'HRRoundScheduled' || app.currentStage === 'HOD2RoundDone') round = 'HR'
    else round = 'HOD'
  }

  if (session.role === 'HOD') {
    if (round === 'HOD' && role.hodUserId && role.hodUserId !== session.sub) {
      redirect('/interviews')
    }
    if (round === 'HOD2' && role.hodRound2UserId && role.hodRound2UserId !== session.sub) {
      redirect('/interviews')
    }
  }

  const hasRubric = role.rubric && role.rubric.length > 0

  // Prep-sidebar data: resume snippet, programmes, prior interviews across
  // all of this candidate's applications, full application trail for
  // context on where they've been.
  const resumeSnippet = (candidate.searchableText ?? '').slice(0, 600)
  const programmes = candidate.tags?.programmes ?? []
  const allApps = (await loadApplications()).filter((a) => a.candidateId === candidate.id)
  const allRoles = await loadRoles()
  const roleById = new Map(allRoles.map((r) => [r.id, r] as const))
  const priorInterviews = (await loadInterviews())
    .filter((i) => i.candidateId === candidate.id)
    .sort((a, b) => (b.conductedAt ?? b.createdAt).localeCompare(a.conductedAt ?? a.createdAt))

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

      {/* 30-second prep sidebar: candidate context so HOD can walk in informed.
          Collapsible to stay out of the way when the HOD wants to focus on scoring. */}
      <details className="mt-6 rounded-lg border border-line bg-card" open>
        <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-ink hover:bg-surface">
          <span className="inline-flex items-center gap-2">
            <span className="font-display">30-second prep</span>
            <span className="text-xs font-normal text-ink-3">
              (resume, past interviews, application trail)
            </span>
          </span>
        </summary>
        <div className="grid gap-5 border-t border-line px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium text-ink">Resume</h2>
              {programmes.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center rounded bg-surface px-2 py-0.5 text-xs text-ink-2"
                >
                  {p}
                </span>
              ))}
              {candidate.resumeFilePath && (
                <span className="text-xs text-ink-3">
                  file: {candidate.resumeFilePath.split('/').pop()}
                </span>
              )}
            </div>
            {resumeSnippet ? (
              <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-line bg-surface px-3 py-2 text-xs text-ink">
                {resumeSnippet}
                {(candidate.searchableText?.length ?? 0) > 600 ? '…' : ''}
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-3">
                No resume text on file. Open the candidate page to see the uploaded file.
              </p>
            )}
            {candidate.notes && (
              <>
                <h3 className="mt-4 text-sm font-medium text-ink">HR notes</h3>
                <p className="mt-1 whitespace-pre-wrap text-xs text-ink-2">{candidate.notes}</p>
              </>
            )}
          </div>
          <div>
            <h2 className="text-sm font-medium text-ink">Past interviews</h2>
            {priorInterviews.length === 0 ? (
              <p className="mt-1 text-xs text-ink-3">None yet. You're the first to score.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {priorInterviews.slice(0, 4).map((i) => (
                  <li key={i.id} className="rounded border border-line bg-surface px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ink">
                        {i.round} round · {i.recommendation}
                      </span>
                      <span className="tabular text-ink-3">
                        {i.aggregateScore != null ? `${i.aggregateScore}/10` : '—'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-ink-3">
                      {formatDate(i.conductedAt ?? i.createdAt)} · by {i.createdBy}
                    </div>
                    {i.notes && (
                      <p className="mt-1 line-clamp-3 text-ink-2">{i.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <h2 className="mt-4 text-sm font-medium text-ink">Application trail</h2>
            <ul className="mt-2 space-y-1 text-xs">
              {allApps.map((a) => {
                const r = roleById.get(a.roleId)
                return (
                  <li key={a.id} className="flex items-start justify-between gap-2">
                    <span className={a.id === app.id ? 'font-medium text-ink' : 'text-ink-2'}>
                      {r?.title ?? 'role'}
                    </span>
                    <span className="tabular text-ink-3">{a.currentStage}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </details>

      <InterviewForm application={app} role={role} round={round} />
    </div>
  )
}
