import Link from 'next/link'
import { notFound } from 'next/navigation'
import { findRoleById, loadApplicationsForRole } from '@/lib/data'
import { orderedStages } from '@/lib/pipeline'
import { Kanban } from '@/components/kanban/Kanban'
import { formatDate } from '@/lib/format'

export default function RoleDetailPage({ params }: { params: { id: string } }) {
  const role = findRoleById(params.id)
  if (!role) notFound()
  const applications = loadApplicationsForRole(role.id)
  const stages = orderedStages(role)

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="border-b border-line bg-card px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <Link href="/roles" className="hover:text-ink">
                Roles
              </Link>
              <span>/</span>
              <span>{role.title}</span>
            </div>
            <h1 className="mt-1 font-display text-xl text-ink">{role.title}</h1>
            <p className="mt-1 text-sm text-ink-2">
              {role.department} · {role.location} · {role.employmentType} · Created{' '}
              {formatDate(role.createdAt)} · Status: {role.status}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/roles/${role.id}/add-candidate`}
              className="inline-flex items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
            >
              Add candidate
            </Link>
          </div>
        </div>
      </div>

      <Kanban role={role} applications={applications} stages={stages} />
    </div>
  )
}
