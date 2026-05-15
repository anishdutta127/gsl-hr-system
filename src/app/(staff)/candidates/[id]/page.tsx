import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  findCandidateById,
  loadApplications,
  loadRoles,
  loadInterviews,
  loadOffers,
  loadUsers,
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
import { PipelineActions } from '@/components/PipelineActions'
import { canAcceptNewCandidates, isPipelineReadOnly } from '@/lib/roleStatus'
import { ApplicationStageActions } from './ApplicationStageActions'
import { HiringManagerControls } from './HiringManagerControls'
import {
  evaluateGate,
  isFeedbackRequiredStage,
  roundLabelForStage,
} from '@/lib/feedbackGate'
import { buildFeedbackRequestMailto } from '@/lib/feedbackRequestMailto'
import { PreOnboardingApprovalBlock } from './PreOnboardingApproval'
import { CandidateResponseForm } from './CandidateResponseForm'
import { SendPreOnboardingEmail } from './SendPreOnboardingEmail'
import {
  getMissingFieldsForTemplate,
  renderEmailTemplate,
  TEMPLATE_ATTACHMENT_SUGGESTIONS,
  type PreOnboardingTemplateId,
  type TemplateContext,
} from '@/lib/preOnboardingEmails'
import { getEmailUnlockState } from '@/lib/preOnboardingEmails/unlockState'
import { loadEmployees, loadITAssets } from '@/lib/data'
import { AssignITAssetsButton } from './AssignITAssetsButton'

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
  const users = loadUsers()
  const usersById = new Map(users.map((u) => [u.id, u] as const))
  const activeStaffOptions = users
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }))

  const canManagePipeline = session.role === 'Admin' || session.role === 'HR'

  // Match the candidate to an Employee record by email so HR-Admin can
  // assign IT assets once the candidate has joined.
  const matchedEmployee = candidate.email
    ? loadEmployees().find(
        (e) => e.email.toLowerCase() === candidate.email.toLowerCase() && e.status === 'Active',
      )
    : undefined
  const availableITAssets = matchedEmployee
    ? loadITAssets()
        .filter((a) => a.status === 'Available')
        .map((a) => ({
          id: a.id,
          category: a.category,
          make: a.make,
          model: a.model,
          serialNumber: a.serialNumber,
          status: a.status,
        }))
    : []

  const memberships = apps.map((a) => ({
    applicationId: a.id,
    roleId: a.roleId,
    roleTitle: roleById.get(a.roleId)?.title ?? '(role removed)',
    currentStage: a.currentStage as string,
  }))
  const openRoleOptions = roles
    .filter((r) => canAcceptNewCandidates(r))
    .map((r) => ({ id: r.id, label: `${r.title} (${r.department})` }))

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

      {matchedEmployee && canManagePipeline && (
        <section className="mb-6 rounded-lg border border-line bg-card p-4" aria-labelledby="it-assets-onboard-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="it-assets-onboard-h" className="text-sm font-medium text-ink">
                IT asset starter kit
              </h2>
              <p className="mt-1 text-xs text-ink-2">
                Joined as{' '}
                <Link
                  href={`/employees/${matchedEmployee.id}`}
                  className="font-medium text-navy hover:underline"
                >
                  {matchedEmployee.name} ({matchedEmployee.employeeCode ?? 'no code'})
                </Link>
                . Assign hardware from available inventory.
              </p>
            </div>
            <AssignITAssetsButton
              employeeId={matchedEmployee.id}
              employeeName={matchedEmployee.name}
              availableAssets={availableITAssets}
            />
          </div>
        </section>
      )}

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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="apps-heading" className="font-display text-lg text-ink">
            Applications ({apps.length})
          </h2>
          {canManagePipeline && (
            <PipelineActions
              candidateId={candidate.id}
              candidateName={candidate.name}
              memberships={memberships}
              openRoles={openRoleOptions}
            />
          )}
        </div>
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

                  {app.currentStage === 'Rejected' && app.rejectionReason && (
                    <div className="mt-2 rounded border border-line bg-surface px-3 py-2 text-xs text-ink-2">
                      <span className="font-medium text-ink">Reason:</span>{' '}
                      {app.rejectionReason}
                      {app.rejectionNotes ? ` · ${app.rejectionNotes}` : ''}
                    </div>
                  )}

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
                  {!terminal && canManagePipeline && role && (
                    <div className="mt-3 border-t border-line pt-3">
                      <ApplicationStageActions
                        role={role}
                        applicationId={app.id}
                        candidateId={candidate.id}
                        candidateName={candidate.name}
                        currentStage={app.currentStage}
                        createdAt={app.createdAt}
                        createdBy={app.createdBy}
                        stageEnteredAt={app.stageEnteredAt}
                        disabled={isPipelineReadOnly(role)}
                      />
                    </div>
                  )}
                  {role && (() => {
                    const eligibleForApproval =
                      app.preOnboardingApproval ||
                      ['HRRoundDone', 'Offered', 'OfferAccepted', 'DocsCollected'].includes(
                        String(app.currentStage),
                      )
                    if (!eligibleForApproval) return null
                    const isAssignedHm =
                      !!app.hiringManagerId && app.hiringManagerId === session.sub
                    return (
                      <div className="mt-3 border-t border-line pt-3">
                        <PreOnboardingApprovalBlock
                          applicationId={app.id}
                          candidateName={candidate.name}
                          roleTitle={role.title}
                          defaults={{
                            ctcConfirmed:
                              app.preOnboardingApproval?.ctcConfirmed ??
                              role.salaryRange?.max,
                            joiningDateConfirmed: app.preOnboardingApproval?.joiningDateConfirmed,
                            locationConfirmed:
                              app.preOnboardingApproval?.locationConfirmed ??
                              (typeof role.location === 'string' ? role.location : undefined),
                            positionConfirmed:
                              app.preOnboardingApproval?.positionConfirmed ?? role.title,
                          }}
                          approval={app.preOnboardingApproval}
                          sessionRole={session.role}
                          isAssignedHiringManager={isAssignedHm}
                        />
                      </div>
                    )
                  })()}
                  {!terminal && role && (() => {
                    const hmId = app.hiringManagerId ?? null
                    const hm = hmId ? usersById.get(hmId) : null
                    const expectedRound = roundLabelForStage(app.currentStage)
                    const gateFires = isFeedbackRequiredStage(app)
                    const currentIdx = role.pipelineStages.indexOf(String(app.currentStage))
                    const nextStage =
                      currentIdx >= 0 && currentIdx < role.pipelineStages.length - 1
                        ? String(role.pipelineStages[currentIdx + 1])
                        : null
                    const gate = gateFires && nextStage
                      ? evaluateGate(app, nextStage)
                      : { cleared: true }
                    const mailto = hm?.email
                      ? buildFeedbackRequestMailto({
                          toEmail: hm.email,
                          toName: hm.name,
                          candidateName: candidate.name,
                          candidateId: candidate.id,
                          roleTitle: role.title,
                          stage: String(app.currentStage),
                          recruiterEmail: session.email,
                          roundLabel: expectedRound,
                        })
                      : '#'
                    return (
                      <HiringManagerControls
                        applicationId={app.id}
                        roleTitle={role.title}
                        candidateName={candidate.name}
                        currentStage={String(app.currentStage)}
                        expectedRound={expectedRound}
                        hiringManagerId={hmId}
                        hiringManagerName={hm?.name ?? null}
                        feedback={app.interviewFeedback ?? []}
                        gateFires={gateFires}
                        gateCleared={gate.cleared}
                        hmOptions={activeStaffOptions}
                        sessionRole={session.role}
                        sessionUserId={session.sub}
                        feedbackRequestMailto={mailto}
                        overrideTargetStage={nextStage}
                      />
                    )
                  })()}
                  {role &&
                    (app.candidateOfferResponse ||
                      (app.preOnboardingEmails ?? []).some((s) => s.templateId === 'offer-intimation')) && (
                      <div className="mt-3 border-t border-line pt-3">
                        <CandidateResponseForm
                          applicationId={app.id}
                          candidateName={candidate.name}
                          response={app.candidateOfferResponse}
                          canEdit={session.role === 'Admin' || session.role === 'HR'}
                        />
                      </div>
                    )}
                  {role && (session.role === 'Admin' || session.role === 'HR') && (() => {
                    const state = getEmailUnlockState(app)
                    const sends = app.preOnboardingEmails ?? []
                    const firstIntimation = sends.find((s) => s.templateId === 'offer-intimation')
                    const hmEmail = app.hiringManagerId
                      ? usersById.get(app.hiringManagerId)?.email
                      : undefined
                    const recruiterName =
                      users.find((u) => u.email === session.email)?.name ?? session.email
                    const sevenDaysOut = new Date()
                    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7)
                    const ccDefault = Array.from(
                      new Set(
                        [session.email, hmEmail].filter(
                          (v): v is string => !!v && v.trim().length > 0,
                        ),
                      ),
                    )
                    const baseContext: TemplateContext = {
                      candidateName: candidate.name,
                      positionTitle:
                        app.preOnboardingApproval?.positionConfirmed ?? role.title,
                      location:
                        app.preOnboardingApproval?.locationConfirmed ??
                        (typeof role.location === 'string' ? role.location : undefined),
                      joiningDate: app.preOnboardingApproval?.joiningDateConfirmed,
                      ctcAmount: app.preOnboardingApproval?.ctcConfirmed,
                      offerIntimationDate: firstIntimation?.sentAt,
                      appointmentReturnByDate: sevenDaysOut.toISOString().slice(0, 10),
                      recruiterName,
                      recruiterEmail: session.email,
                    }
                    type ButtonSpec = {
                      templateId: PreOnboardingTemplateId
                      label: string
                      visible: boolean
                    }
                    const buttons: ButtonSpec[] = [
                      {
                        templateId: 'offer-intimation',
                        label: 'Send Offer Intimation',
                        visible: state.intimation === 'unlocked',
                      },
                      {
                        templateId: 'offer-followup',
                        label: 'Send Follow-up',
                        visible: state.followup === 'unlocked',
                      },
                      {
                        templateId: 'appointment-letter',
                        label: 'Send Appointment Letter',
                        visible: state.appointment === 'unlocked',
                      },
                      {
                        templateId: 'notice-period-checkin',
                        label: 'Send Notice Period Check-in',
                        visible: state.noticeCheckin === 'unlocked',
                      },
                    ]
                    const anyVisible = buttons.some((b) => b.visible)
                    if (!anyVisible && sends.length === 0) return null
                    return (
                      <div className="mt-3 space-y-3 border-t border-line pt-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-ink-3">
                          Pre-onboarding emails
                        </div>
                        {anyVisible && (
                          <div className="flex flex-wrap gap-2">
                            {buttons
                              .filter((b) => b.visible)
                              .map((b) => {
                                const missing = getMissingFieldsForTemplate(
                                  b.templateId,
                                  baseContext,
                                )
                                if (missing.length > 0) {
                                  return (
                                    <button
                                      key={b.templateId}
                                      type="button"
                                      disabled
                                      title={`Cannot send yet: missing ${missing.join(', ')}.`}
                                      className="inline-flex min-h-[36px] cursor-not-allowed items-center rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-3"
                                    >
                                      {b.label} (missing: {missing.join(', ')})
                                    </button>
                                  )
                                }
                                // Server-side render of the template so the
                                // client component never imports loadCompany
                                // / Node fs. Pass the rendered subject+body
                                // as props.
                                let prerenderedSubject = ''
                                let prerenderedBody = ''
                                let renderError: string | undefined
                                try {
                                  const out = renderEmailTemplate(b.templateId, baseContext)
                                  prerenderedSubject = out.subject
                                  prerenderedBody = out.body
                                } catch (err) {
                                  renderError =
                                    err instanceof Error ? err.message : 'Template render failed.'
                                }
                                return (
                                  <SendPreOnboardingEmail
                                    key={b.templateId}
                                    applicationId={app.id}
                                    candidateName={candidate.name}
                                    candidateEmail={candidate.email}
                                    hiringManagerEmail={hmEmail}
                                    defaults={{
                                      templateId: b.templateId,
                                      ccDefault,
                                      prerenderedSubject,
                                      prerenderedBody,
                                      attachmentSuggestions:
                                        TEMPLATE_ATTACHMENT_SUGGESTIONS[b.templateId],
                                      renderError,
                                    }}
                                  />
                                )
                              })}
                          </div>
                        )}
                        {sends.length > 0 && (
                          <details className="rounded border border-line bg-surface px-3 py-2 text-xs">
                            <summary className="cursor-pointer font-medium text-ink-2">
                              Past pre-onboarding emails ({sends.length})
                            </summary>
                            <ol className="mt-2 space-y-1.5">
                              {[...sends].reverse().map((s, idx) => (
                                <li
                                  key={idx}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1.5"
                                >
                                  <span className="text-ink">
                                    <span className="font-medium">{s.templateId}</span>
                                    <span className="ml-2 text-ink-3">by {s.sentBy}</span>
                                  </span>
                                  <time className="text-ink-3" dateTime={s.sentAt}>
                                    {formatDate(s.sentAt)}
                                  </time>
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </div>
                    )
                  })()}
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
