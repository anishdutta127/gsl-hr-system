import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentSession } from '@/lib/identity'
import { loadRoles } from '@/lib/data'
import { UserForm } from '../UserForm'

export const dynamic = 'force-dynamic'

export default async function NewUserPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin') redirect('/')

  const roles = loadRoles()

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/users" className="hover:text-ink">
          Users
        </Link>{' '}
        / New user
      </div>
      <h1 className="font-display text-2xl text-ink">New user</h1>
      <p className="mt-1 text-sm text-ink-2">
        Starter password applies immediately. User can change it via their profile.
      </p>
      <UserForm mode="create" roles={roles} />
    </div>
  )
}
