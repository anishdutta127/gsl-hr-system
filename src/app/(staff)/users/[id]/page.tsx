import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentSession } from '@/lib/identity'
import { loadRoles, loadUsers } from '@/lib/data'
import { UserForm } from '../UserForm'

export const dynamic = 'force-dynamic'

export default async function EditUserPage({ params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin') redirect('/')

  const user = (await loadUsers()).find((u) => u.id === params.id)
  if (!user) notFound()
  const roles = await loadRoles()

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/users" className="hover:text-ink">
          Users
        </Link>{' '}
        / {user.name}
      </div>
      <h1 className="font-display text-2xl text-ink">Edit: {user.name}</h1>
      <UserForm mode="edit" roles={roles} user={user} />
    </div>
  )
}
