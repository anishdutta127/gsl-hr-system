import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadUsers } from '@/lib/data'
import { canEditHrTasks, canViewHrTasks, loadHrTasks } from '@/lib/hrTasks'
import { HrTaskBoard } from './HrTaskBoard'

export const dynamic = 'force-dynamic'

/**
 * Internal HR task board. Cross-stakeholder task tracker for HR Ops - status,
 * ownership, sub-stages, dependency (who it's pending with + why), blockers,
 * next step. Staff only (Admin/HR/HOD/Leadership); HR + Admin edit, others read.
 */
export default async function HrTasksPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (!canViewHrTasks(session)) redirect('/')

  const tasks = loadHrTasks()
  const users = loadUsers()
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Task board</h1>
        <p className="mt-1 text-sm text-ink-2">
          Track HR work that spans teams: status, owner, sub-stages, who each task is pending with
          and why, blockers and the next step. Internal only.
        </p>
      </div>
      <HrTaskBoard tasks={tasks} users={users} canEdit={canEditHrTasks(session)} />
    </div>
  )
}
