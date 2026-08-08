import Link from 'next/link'
import { redirect } from 'next/navigation'
import { loadUsers, loadRoles } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { formatDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin') redirect('/')

  const users = await loadUsers()
  const roles = await loadRoles()
  const roleById = new Map(roles.map((r) => [r.id, r] as const))

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Users</h1>
          <p className="mt-1 text-sm text-ink-2">
            Admin-managed staff accounts. Per-user identity drives the audit log.
          </p>
        </div>
        <Link
          href="/users/new"
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
        >
          New user
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Assigned roles</th>
              <th className="px-5 py-3 font-medium">Active</th>
              <th className="px-5 py-3 font-medium">Last login</th>
              <th className="px-5 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-ink-2">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3 font-medium text-ink">{u.name}</td>
                  <td className="px-5 py-3 text-ink-2">{u.email}</td>
                  <td className="px-5 py-3 text-ink-2">{u.role}</td>
                  <td className="px-5 py-3 text-ink-2">
                    {(u.ownedRoleIds ?? [])
                      .map((rid) => roleById.get(rid)?.title ?? rid)
                      .join(', ') || '-'}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        u.active
                          ? 'inline-flex items-center rounded bg-teal-light px-2 py-0.5 text-xs font-medium text-teal-dark'
                          : 'inline-flex items-center rounded bg-surface px-2 py-0.5 text-xs text-ink-2'
                      }
                    >
                      {u.active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-ink-3 tabular">
                    {u.lastLoginAt ? formatDate(u.lastLoginAt) : '-'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/users/${u.id}`}
                      className="text-xs font-medium text-navy hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
