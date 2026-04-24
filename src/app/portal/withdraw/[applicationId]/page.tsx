import { notFound, redirect } from 'next/navigation'
import { findApplicationById, findRoleById } from '@/lib/data'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { isTerminal } from '@/lib/pipeline'
import { WithdrawForm } from './WithdrawForm'

export const dynamic = 'force-dynamic'

export default async function WithdrawPage({ params }: { params: { applicationId: string } }) {
  const candidateId = await getCurrentCandidateId()
  if (!candidateId) redirect('/portal/request-new-link')

  const app = findApplicationById(params.applicationId)
  if (!app || app.candidateId !== candidateId) notFound()
  const role = findRoleById(app.roleId)
  if (!role) notFound()

  if (isTerminal(app.currentStage)) {
    return (
      <div className="container-page py-10">
        <div className="mx-auto max-w-xl rounded-lg border border-line bg-card p-8 text-sm text-ink">
          This application is already {app.currentStage}.
        </div>
      </div>
    )
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-2xl text-ink">Withdraw application?</h1>
        <p className="mt-3 text-sm text-ink-2">
          You can withdraw your application for <span className="font-medium">{role.title}</span>{' '}
          at any point. This is final: we will close your file and stop reaching out.
        </p>
        <WithdrawForm applicationId={app.id} />
      </div>
    </div>
  )
}
