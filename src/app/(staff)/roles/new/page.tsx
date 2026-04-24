import { NewRoleForm } from './NewRoleForm'
import { requireRoles } from '@/lib/guards'

export const dynamic = 'force-dynamic'

export default async function NewRolePage() {
  await requireRoles(['Admin', 'HR'])
  return (
    <div className="container-page py-8">
      <h1 className="mb-2 font-display text-2xl text-ink">New role</h1>
      <p className="mb-6 text-sm text-ink-2">
        Create a role. You can refine the pipeline and rubric after creation.
      </p>
      <NewRoleForm />
    </div>
  )
}
