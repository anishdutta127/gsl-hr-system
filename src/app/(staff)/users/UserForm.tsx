'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Role, StaffRole, User } from '@/lib/types'

interface UserFormProps {
  mode: 'create' | 'edit'
  roles: Pick<Role, 'id' | 'title' | 'department'>[]
  user?: User
}

const STAFF_ROLES: StaffRole[] = ['Admin', 'HR', 'HOD', 'Leadership']

export function UserForm({ mode, roles, user }: UserFormProps) {
  const router = useRouter()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<StaffRole>(user?.role ?? 'HR')
  const [password, setPassword] = useState('')
  const [active, setActive] = useState<boolean>(user?.active ?? true)
  const [ownedRoleIds, setOwnedRoleIds] = useState<string[]>(user?.ownedRoleIds ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Name is required.')
    if (!email.trim()) return setError('Email is required.')
    if (mode === 'create' && !password) return setError('Starter password is required.')
    if (password && password.length < 6) return setError('Password must be at least 6 characters.')

    setBusy(true)
    try {
      const url = mode === 'create' ? '/api/users' : `/api/users/${user!.id}`
      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        role,
        active,
        ownedRoleIds: role === 'HOD' ? ownedRoleIds : [],
      }
      if (password) body.password = password
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Could not save.' }))
        setError(body.message ?? 'Could not save.')
        setBusy(false)
        return
      }
      router.push('/users')
      router.refresh()
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 max-w-2xl space-y-4" aria-label="User form">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-ink">
          Name *
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Email *
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>
      <div>
        <label htmlFor="role" className="block text-sm font-medium text-ink">
          Role
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {role === 'HOD' && (
        <fieldset className="rounded border border-line bg-surface/30 p-4">
          <legend className="text-sm font-medium text-ink">Roles owned (HODs only)</legend>
          <div className="mt-2 space-y-1 text-sm">
            {roles.length === 0 ? (
              <p className="text-ink-2">No roles to assign yet.</p>
            ) : (
              roles.map((r) => (
                <label key={r.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ownedRoleIds.includes(r.id)}
                    onChange={(e) =>
                      setOwnedRoleIds((prev) =>
                        e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                      )
                    }
                    className="h-4 w-4 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
                  />
                  <span>
                    {r.title} <span className="text-xs text-ink-3">({r.department})</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </fieldset>
      )}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          {mode === 'create' ? 'Starter password *' : 'Reset password (leave blank to keep)'}
        </label>
        <input
          id="password"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
        <p className="mt-1 text-xs text-ink-3">
          User can change it anytime from their profile.
        </p>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
        />
        <span className="text-sm text-ink">Active (can sign in)</span>
      </label>

      {error && (
        <div role="alert" className="rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2.5 text-base font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy ? 'Saving…' : mode === 'create' ? 'Create user' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
