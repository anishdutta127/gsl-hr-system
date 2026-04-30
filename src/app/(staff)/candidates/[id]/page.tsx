import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  findCandidateById,
  loadApplications,
  loadRoles,
  loadInterviews,
  loadOffers,
} from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate, formatRelative } from '@/lib/format'
import { isTerminal } from '@/lib/pipeline'
import { EMAIL_TEMPLATES } from '@/lib/emailTemplates'
import { ReplyWidget } from './ReplyWidget'
import { UnarchiveButton } from './UnarchiveButton'
import { ResumeUpload } from './ResumeUpload'
import { CandidateEdit } from './CandidateEdit'
import { StagePill } from '@/components/StagePill'

export const dynamic = 'force-dynamic'

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { notice?: string }
}) {
  const session = await requireRoles(['Admin', 'HR', 'HOD'])
  const candidate = findCandidateById(params.id)
  if (!candidate) notFound()
  const notice = searchParams.notice ?? ''

  const apps = loadApplications().filter((a) => a.candidateId === candidate.id)
  const roles = loadRoles()
  const roleById = new Map(roles.map((r) => [r.id, r] as const))

  // HOD scoping: must own at least one of the roles this candidate applied to.
  if (session.role === 'HOD') {
    const owns = apps.some((a) => roleById.get(a.roleId)?.hodUserId === session.sub)
    if (!owns) redirect('/candidates')
  }

  const interviews = loadInterviews().filter((i) => i.candidateId === candidate.id)
  const offers = loadOffers().filter((o) => o.candidateId === candidate.id)

  // Latest non-terminal application gives the reply-widget its stage + role context.
  const latestActiveApp = [...apps]
    .filter((a) => !isTerminal(a.currentStage))
    .sort((a, b) => b.stageEnteredAt.localeCompare(a.stageEnteredAt))[0]
  const currentStage = latestActiveApp?.currentStage ?? null
  const activeRoleId = latestActiveApp?.roleId ?? ''
  const canEmail = session.role === 'Admin' || session.role === 'HR'
  const suggested = currentStage
    ? EMAIL_TEMPLATES.filter((t) => t.stagesApplicable.includes(currentStage))
    : []
  const suggestedIds = new Set(suggested.map((t) => t.id))
  const others = EMAIL_TEMPLATES.filter((t) => !suggestedIds.has(t.id))

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/candidates" className="hover:text-ink">
          Candidates
        </Link>{' '}
        / {candidate.name}
      </div>

      {notice === 'duplicate' && (
        <div
          role="status"
          className="mb-4 rounded border border-warning bg-warning-bg px-3 py-2 text-sm text-ink"
        >
          This candidate already exists in the pool. Showing the existing record.
        </div>
      )}
      {notice === 'duplicate-archived' && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-warning bg-warning-bg px-3 py-2 text-sm text-ink"
        >
          <span>
            A candidate with this email exists in the archive. Open the existing record below or
            unarchive to bring them back into the pool.
          </span>
          {(session.role === 'Admin' || session.role === 'HR') && (
            <UnarchiveButton candidateId={candidate.id} />
          )}
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl text-ink">{candidate.name}</h1>
            {candidate.status === 'Archived' && (
              <span className="inline-flex items-center rounded bg-surface px-2 py-0.5 text-xs font-medium text-ink-2">
                Archived
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {candidate.email || 'no email on file'}
            {candidate.phone ? ` · ${candidate.phone}` : ''} · Source: {candidate.source}
          </p>
          {(candidate.tags?.programmes?.length ?? 0) > 0 && (
            <p className="mt-1 text-xs text-ink-2">
              Programmes: {(candidate.tags?.programmes ?? []).join(', ')}
            </p>
          )}
          <p className="mt-1 text-xs text-ink-3">
            Added {formatDate(candidate.createdAt)} by {candidate.createdBy}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {(session.role === 'Admin' || session.role === 'HR') && (
            <CandidateEdit
              candidateId={candidate.id}
              initial={{
                name: candidate.name,
                email: candidate.email,
                phone: candidate.phone ?? '',
                source: candidate.source,
                notes: candidate.notes ?? '',
                programmes: candidate.tags?.programmes ?? [],
              }}
            />
          )}
          {candidate.status === 'Archived' && (session.role === 'Admin' || session.role === 'HR') && (
            <UnarchiveButton candidateId={candidate.id} />
          )}
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-2">Resume</h2>
          <div className="flex items-center gap-2">
            {candidate.resumeFilePath ? (
              <>
                <a
                  href={`/api/resumes/${candidate.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  View resume
                </a>
                {(session.role === 'Admin' || session.role === 'HR') && (
                  <ResumeUpload candidateId={candidate.id} />
                )}
              </>
            ) : (
              <>
                <span className="text-xs text-ink-3">No resume on file.</span>
                {(session.role === 'Admin' || session.role === 'HR') && (
                  <ResumeUpload candidateId={candidate.id} />
                )}
              </>
            )}
          </div>
        </div>
        {candidate.resumeFilePath && (
          <p className="mt-2 break-all text-xs text-ink-3">{candidate.resumeFilePath}</p>
        )}
      </section>

      {candidate.notes && (
        <section className="mb-6 rounded-lg border border-line bg-card p-4">
          <h2 className="mb-1 text-sm font-medium text-ink-2">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-ink">{candidate.notes}</p>
        </section>
      )}

      {canEmail && (
        <section className="mb-6">
          <ReplyWidget
            candidateId={candidate.id}
            candidateName={candidate.name}
            candidateEmail={candidate.email}
            roleId={activeRoleId}
            stageApplicable={suggested.map((t) => ({
              id: t.id,
              title: t.title,
              tone: t.tone,
              description: t.description,
            }))}
            allOthers={others.map((t) => ({
              id: t.id,
              title: t.title,
              tone: t.tone,
              description: t.description,
            }))}
          />
        </section>
      )}

      <section aria-labelledby="apps-heading" className="mb-6">
        <h2 id="apps-heading" className="mb-3 font-display text-lg text-ink">
          Applications ({apps.length})
        </h2>
        {apps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No applications yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {apps.map((app) => {
              const role = roleById.get(app.roleId)
              const appInterviews = interviews.filter((i) => i.applicationId === app.id)
              const appOffers = offers.filter((o) => o.applicationId === app.id)
              const terminal = isTerminal(app.currentStage)
              return (
                <li
                  key={app.id}
                  className="rounded-lg border border-line bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link
                        href={`/roles/${app.roleId}`}
                        className="font-medium text-ink hover:text-navy"
                      >
                        {role?.title ?? '(role removed)'}
                      </Link>
                      <div className="mt-0.5 text-xs text-ink-2">
                        {role?.department} · Applied {formatDate(app.createdAt)}
                      </div>
                    </div>
                    <StagePill stage={app.currentStage} />
                    {/* terminal styling now derived inside StagePill */}
                    <span className="sr-only">{terminal ? 'Terminal' : 'Active'}</span>
                  </div>

                  <div className="mt-3 text-xs text-ink-3">
                    In stage for {formatRelative(app.stageEnteredAt, { addSuffix: false })}
                  </div>

                  {(appInterviews.length > 0 || appOffers.length > 0) && (
                    <div className="mt-3 border-t border-line pt-3 text-xs text-ink-2">
                      {appInterviews.length > 0 && (
                        <div>
                          Interviews: {appInterviews.length}
                          {appInterviews
                            .slice(0, 2)
                            .map(
                              (i) =>
                                ` · ${i.round} round${i.aggregateScore != null ? ` (${i.aggregateScore}/10)` : ''}`,
                            )
                            .join('')}
                        </div>
                      )}
                      {appOffers.length > 0 && (
                        <div className="mt-1">
                          Offers:{' '}
                          {appOffers
                            .map((o) => `${o.status}`)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  )}

                  {!terminal && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/roles/${app.roleId}`}
                        className="inline-flex items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
                      >
                        Open role pipeline
                      </Link>
                      <Link
                        href={`/interviews/new?applicationId=${app.id}`}
                        className="inline-flex items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
                      >
                        Score an interview
                      </Link>
                      {(app.currentStage === 'HRRoundDone' ||
                        app.currentStage === 'Offered' ||
                        app.currentStage === 'OfferAccepted') && (
                        <Link
                          href={`/offers/new?applicationId=${app.id}`}
                          className="inline-flex items-center rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-dark"
                        >
                          Draft offer
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="mb-3 font-display text-lg text-ink">
          Audit timeline
        </h2>
        {candidate.auditLog.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No audit entries yet.
          </div>
        ) : (
          <ol className="space-y-2">
            {[...candidate.auditLog].reverse().map((entry, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-line bg-card px-4 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">{entry.action}</div>
                    {entry.notes && (
                      <div className="mt-0.5 text-xs text-ink-2">{entry.notes}</div>
                    )}
                  </div>
                  <time className="shrink-0 text-xs text-ink-3 tabular" dateTime={entry.timestamp}>
                    {formatDate(entry.timestamp)}
                  </time>
                </div>
                <div className="mt-1 text-xs text-ink-3">by {entry.user}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
