'use client'

import { useState } from 'react'

export function RequestLinkForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/public/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Could not send.' }))
        setError(body.message ?? 'Could not send.')
        setBusy(false)
        return
      }
      setSent(true)
      let s = 30
      setCooldown(s)
      const timer = setInterval(() => {
        s -= 1
        setCooldown(s)
        if (s <= 0) clearInterval(timer)
      }, 1000)
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mt-6 rounded-lg border border-line bg-card p-6 text-sm text-ink"
      >
        <p className="font-medium text-ink">
          If that email matches an application, we've sent a link. Check your inbox.
        </p>
        <p className="mt-2 text-sm text-ink-2">
          Links expire in 15 minutes. Didn't arrive? Check spam first.
        </p>
        <button
          type="button"
          disabled={cooldown > 0}
          onClick={() => setSent(false)}
          className="mt-4 inline-flex items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send another'}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-line bg-card p-6">
      <label htmlFor="email" className="block text-sm font-medium text-ink">
        Email you applied with
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
      {error && (
        <div
          role="alert"
          className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2.5 text-base font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send link'}
      </button>
    </form>
  )
}
