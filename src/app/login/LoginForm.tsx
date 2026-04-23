'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  next?: string
  initialError?: string
}

export function LoginForm({ next, initialError }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Sign-in failed.' }))
        setError(body.message ?? 'Sign-in failed.')
        return
      }
      startTransition(() => {
        router.push(next && next.startsWith('/') ? next : '/')
        router.refresh()
      })
    } catch (err) {
      setError('Network error. Try again in a moment.')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-line bg-card p-6 shadow-sm"
      aria-label="Sign in form"
    >
      {error && (
        <div
          role="alert"
          className="mb-4 rounded border border-danger-bg bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}
      <label htmlFor="email" className="block text-sm font-medium text-ink">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
      <label htmlFor="password" className="mt-4 block text-sm font-medium text-ink">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
      <button
        type="submit"
        disabled={isPending}
        className="mt-6 block w-full rounded bg-navy px-4 py-2 text-base font-medium text-white transition-colors hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="mt-4 text-xs text-ink-3">
        First-time users: the initial password was communicated by Anish. Change it after
        you sign in for the first time.
      </p>
    </form>
  )
}
