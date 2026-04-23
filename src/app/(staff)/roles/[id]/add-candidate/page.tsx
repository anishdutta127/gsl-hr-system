import { notFound } from 'next/navigation'
import { findRoleById } from '@/lib/data'
import { AddCandidateForm } from './AddCandidateForm'

export default function AddCandidatePage({ params }: { params: { id: string } }) {
  const role = findRoleById(params.id)
  if (!role) notFound()
  return (
    <div className="container-page py-8">
      <div className="mb-4 text-xs text-ink-3">
        Roles / {role.title} / Add candidate
      </div>
      <h1 className="mb-2 font-display text-2xl text-ink">Add candidate to {role.title}</h1>
      <p className="mb-6 text-sm text-ink-2">
        Candidate lands in the Sourced stage. Move them forward as they progress.
      </p>
      <AddCandidateForm roleId={role.id} />
    </div>
  )
}
