import { notFound } from 'next/navigation'
import Link from 'next/link'
import { findRoleById } from '@/lib/data'
import { RubricEditor } from './RubricEditor'

export const dynamic = 'force-dynamic'

export default function RoleRubricPage({ params }: { params: { id: string } }) {
  const role = findRoleById(params.id)
  if (!role) notFound()
  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href={`/roles/${role.id}`} className="hover:text-ink">
          {role.title}
        </Link>{' '}
        / Rubric
      </div>
      <h1 className="font-display text-2xl text-ink">Rubric: {role.title}</h1>
      <p className="mt-1 text-sm text-ink-2">
        HODs score candidates against this rubric during interviews. Weights are relative; any
        number works. Scales map to 0-10 for aggregation.
      </p>
      <RubricEditor roleId={role.id} initial={role.rubric} />
    </div>
  )
}
