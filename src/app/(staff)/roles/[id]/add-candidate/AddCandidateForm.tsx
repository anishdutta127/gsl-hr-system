'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CANDIDATE_SOURCES } from '@/lib/types'

export function AddCandidateForm({ roleId }: { roleId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    source: CANDIDATE_SOURCES[0] as string,
    notes: '',
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError('Candidate name required.')
      return
    }
    if (!form.email.trim()) {
      setError('Email required.')
      return
    }
    try {
      const response = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, roleId }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Could not add candidate.' }))
        setError(body.message ?? 'Could not add candidate.')
        return
      }
      startTransition(() => {
        router.push(`/roles/${roleId}`)
        router.refresh()
      })
    } catch {
      setError('Network error. Try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5 rounded-lg border border-line bg-card p-6">
      {error && (
        <div role="alert" className="rounded border border-danger-bg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Full name</span>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </label>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Email</span>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Phone</span>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+91-XXXXXXXXXX"
            className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Source</span>
        <select
          value={form.source}
          onChange={(e) => setForm({ ...form, source: e.target.value })}
          className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          {CANDIDATE_SOURCES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Notes (optional)</span>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
          className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isPending ? 'Adding…' : 'Add candidate'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded border border-line-strong bg-card px-4 py-2 text-sm text-ink-2 hover:bg-surface"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-ink-3">
        Saves to the queue. Candidate appears in the Sourced column in ~1 minute.
      </p>
    </form>
  )
}
