import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadUsers } from '@/lib/data'
import { canEditHrTasks, canViewHrTasks, findHrTask } from '@/lib/hrTasks'
import { HrTaskDetail } from './HrTaskDetail'

export const dynamic = 'force-dynamic'

export default async function HrTaskDetailPage({ params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (!canViewHrTasks(session)) redirect('/')

  const task = findHrTask(params.id)
  if (!task) notFound()

  const users = (await loadUsers())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="container-page py-8">
      <div className="mb-2">
        <Link href="/hr-tasks" className="text-xs font-medium text-orange-dark hover:underline">
          &larr; Back to task board
        </Link>
      </div>
      <HrTaskDetail task={task} users={users} canEdit={canEditHrTasks(session)} canDelete={session.role === 'Admin'} />
    </div>
  )
}
