'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' })
    startTransition(() => {
      router.push('/login')
      router.refresh()
    })
  }
  return (
    <button
      onClick={handleLogout}
      disabled={isPending}
      className="w-full rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
    >
      {isPending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
