import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import {
  findApplicationById,
  findCandidateById,
  findRoleById,
  loadEmployees,
  loadOffers,
} from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { EmployeeActivationForm } from './EmployeeActivationForm'

export const dynamic = 'force-dynamic'

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: { applicationId?: string }
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin' && session.role !== 'HR') {
    redirect('/')
  }

  const applicationId = searchParams.applicationId
  if (!applicationId) notFound()
  const app = await findApplicationById(applicationId)
  if (!app) notFound()
  const candidate = await findCandidateById(app.candidateId)
  const role = await findRoleById(app.roleId)
  if (!candidate || !role) notFound()

  const existing = (await loadEmployees()).find((e) => e.applicationId === applicationId)
  if (existing) {
    redirect(`/employees/${existing.id}`)
  }

  const offer = (await loadOffers()).find(
    (o) => o.applicationId === applicationId && o.status === 'Accepted',
  )

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/employees" className="hover:text-ink">
          Employees
        </Link>{' '}
        / Activate {candidate.name}
      </div>
      <h1 className="font-display text-2xl text-ink">Activate: {candidate.name}</h1>
      <p className="mt-1 text-sm text-ink-2">
        {role.title} · {role.department} · Stage: {app.currentStage}
      </p>
      <EmployeeActivationForm
        applicationId={applicationId}
        defaultValues={{
          designation: offer?.designation ?? role.title,
          department: role.department,
          location: offer?.location ?? role.location,
          ctcAnnual: offer?.compensation.ctcAnnual ?? 0,
          reportingTo: offer?.reportingTo ?? '',
          dateOfJoining: offer?.proposedJoiningDate ?? new Date().toISOString().slice(0, 10),
          phone: candidate.phone ?? '',
        }}
      />
    </div>
  )
}
