import { notFound, redirect } from 'next/navigation'
import { findApplicationById, findRoleById } from '@/lib/data'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { AssessmentCompleteForm } from './AssessmentCompleteForm'

export const dynamic = 'force-dynamic'

export default async function AssessmentPage({ params }: { params: { id: string } }) {
  const candidateId = await getCurrentCandidateId()
  if (!candidateId) redirect('/portal/request-new-link')

  const app = findApplicationById(params.id)
  if (!app || app.candidateId !== candidateId) notFound()
  const role = findRoleById(app.roleId)
  if (!role) notFound()

  const isAssessmentStage =
    app.currentStage === 'AssessmentSent' || app.currentStage === 'AssessmentDone'
  const done = app.currentStage === 'AssessmentDone'

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-2xl text-ink">Assessment: {role.title}</h1>

        {!isAssessmentStage && (
          <div className="mt-6 rounded-lg border border-line bg-card p-6 text-sm text-ink-2">
            No assessment is pending for this application right now.
          </div>
        )}

        {isAssessmentStage && (
          <>
            <section className="mt-6 rounded-lg border border-line bg-card p-6">
              <h2 className="font-display text-lg text-ink">Instructions</h2>
              <p className="mt-3 text-sm text-ink">
                We've shared the assessment document with you by email. The task should take around
                60 minutes. Work through it at your own pace.
              </p>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink">
                <li>Open the document we emailed.</li>
                <li>Work through every section. Answer in your own words.</li>
                <li>Reply to the email with your completed document attached.</li>
                <li>Come back here and mark it complete.</li>
              </ol>
              <p className="mt-4 text-xs text-ink-3">
                Can't find the email? Check spam, or write to HR from the contact listed on your
                home page.
              </p>
            </section>

            {done ? (
              <div
                role="status"
                className="mt-6 rounded-lg border border-success bg-success-bg p-6 text-sm text-ink"
              >
                Thanks. We've marked your assessment complete. HR will review it and follow up.
              </div>
            ) : (
              <section className="mt-6 rounded-lg border border-line bg-card p-6">
                <h2 className="font-display text-lg text-ink">Mark it complete</h2>
                <p className="mt-2 text-sm text-ink-2">
                  Once you've emailed your completed document, tap the button below to let HR know.
                </p>
                <AssessmentCompleteForm applicationId={app.id} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
