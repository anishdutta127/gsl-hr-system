import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import {
  findApplicationById,
  findCandidateById,
  findRoleById,
} from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { OfferDraftForm } from './OfferDraftForm'

export const dynamic = 'force-dynamic'

export default async function NewOfferPage({
  searchParams,
}: {
  searchParams: { applicationId?: string }
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const applicationId = searchParams.applicationId
  if (!applicationId) notFound()
  const app = findApplicationById(applicationId)
  if (!app) notFound()
  const candidate = findCandidateById(app.candidateId)
  const role = findRoleById(app.roleId)
  if (!candidate || !role) notFound()

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href={`/candidates/${candidate.id}`} className="hover:text-ink">
          {candidate.name}
        </Link>{' '}
        / Draft offer
      </div>
      <h1 className="font-display text-2xl text-ink">Draft offer: {candidate.name}</h1>
      <p className="mt-1 text-sm text-ink-2">
        {role.title} · {role.department} · Current stage: {app.currentStage}
      </p>
      <OfferDraftForm application={app} role={role} candidate={candidate} />
    </div>
  )
}
