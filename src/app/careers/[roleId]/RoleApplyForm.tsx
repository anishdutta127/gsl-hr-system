'use client'

import { useState } from 'react'

export function RoleApplyForm({ roleId, roleTitle }: { roleId: string; roleTitle: string }) {
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const data = new FormData(e.currentTarget)
    const payload = {
      roleId,
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      coverNote: String(data.get('coverNote') ?? '').trim(),
      /** honeypot — bots fill, humans don't see it */
      website: String(data.get('website') ?? '').trim(),
    }
    try {
      const res = await fetch('/api/public/careers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Could not send.' }))
        setError(body.message ?? 'Could not send.')
        setBusy(false)
        return
      }
      setSubmitted(true)
    } catch {
      setError("We couldn't reach our server. Your details are saved; try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded bg-success-bg px-4 py-4 text-sm text-ink"
      >
        <p className="font-medium text-ink">Thanks — we've got your application for {roleTitle}.</p>
        <p className="mt-2 text-sm text-ink-2">
          You'll get a confirmation email within a few minutes. We reply to every application,
          even if it's a no: typically within two weeks.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label={`Apply for ${roleTitle}`}>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <FormField id="name" label="Full name" type="text" required autoComplete="name" />
      <FormField id="email" label="Email" type="email" required autoComplete="email" />
      <FormField id="phone" label="Phone" type="tel" required autoComplete="tel" />

      <div className="mt-4">
        <label htmlFor="coverNote" className="block text-sm font-medium text-ink">
          A short note (optional)
        </label>
        <textarea
          id="coverNote"
          name="coverNote"
          rows={4}
          placeholder="What draws you to this role, any relevant context."
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>

      {/* Honeypot — hidden from humans + screen readers via aria-hidden */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <label htmlFor="website">Website (leave empty)</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-5 block w-full rounded bg-navy px-4 py-3 text-base font-medium text-white transition-colors hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send application'}
      </button>
      <p className="mt-3 text-xs text-ink-3">
        We store your details only to contact you about this role. No third-party sharing.
      </p>
    </form>
  )
}

function FormField({
  id,
  label,
  type,
  required,
  autoComplete,
}: {
  id: string
  label: string
  type: string
  required?: boolean
  autoComplete?: string
}) {
  return (
    <div className="mt-4 first:mt-0">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
    </div>
  )
}
