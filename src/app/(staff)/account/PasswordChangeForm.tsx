'use client'

import { useState } from 'react'

export function PasswordChangeForm() {
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (newPassword.length < 6) return setError('New password must be at least 6 characters.')
    if (newPassword !== confirm) return setError('New passwords do not match.')
    setBusy(true)
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed.' }))
        setError(body.message ?? 'Failed.')
        setBusy(false)
        return
      }
      setSuccess(true)
      setCurrent('')
      setNewPwd('')
      setConfirm('')
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3" aria-label="Change password">
      <div>
        <label htmlFor="current" className="block text-sm font-medium text-ink">
          Current password
        </label>
        <input
          id="current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>
      <div>
        <label htmlFor="new" className="block text-sm font-medium text-ink">
          New password
        </label>
        <input
          id="new"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPwd(e.target.value)}
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-ink">
          Confirm new password
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>
      {error && (
        <div role="alert" className="rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded border border-teal bg-teal-light px-3 py-2 text-sm text-teal-dark">
          Password updated. Use the new one next time you sign in.
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Update password'}
      </button>
    </form>
  )
}
