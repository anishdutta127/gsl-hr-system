'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RichTextEditor } from '@/components/RichTextEditor'

const DEPARTMENTS = ['Academics', 'Premium Sales', 'Operations', 'STEM', 'Marketing', 'Instructional Design', 'Other']
const LOCATIONS = ['Mumbai', 'Delhi', 'Bengaluru', 'Remote', 'Hybrid']
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'] as const

export function NewRoleForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    department: DEPARTMENTS[0],
    location: LOCATIONS[0],
    employmentType: EMPLOYMENT_TYPES[0] as string,
    description: '',
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!form.title.trim()) {
      setError('Role title is required.')
      return
    }
    try {
      const response = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Could not create role.' }))
        setError(body.message ?? 'Could not create role.')
        return
      }
      const data = (await response.json()) as { roleId: string }
      startTransition(() => {
        router.push('/roles')
        router.refresh()
      })
    } catch (err) {
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

      <Field label="Role title" htmlFor="title">
        <input
          id="title"
          name="title"
          type="text"
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. Senior Academics Lead"
          className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Department" htmlFor="department">
          <select
            id="department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>

        <Field label="Location" htmlFor="location">
          <select
            id="location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Employment type" htmlFor="employmentType">
        <select
          id="employmentType"
          value={form.employmentType}
          onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
          className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>

      <div role="group" aria-labelledby="role-description-label">
        <span id="role-description-label" className="mb-1 block text-sm font-medium text-ink">
          Description
        </span>
        <RichTextEditor
          ariaLabel="Role description"
          value={form.description}
          onChange={(html) => setForm({ ...form, description: html })}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isPending ? 'Creating…' : 'Create role'}
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
        Default pipeline stages are applied. You can customise them on the role's detail page.
        Changes save to the queue and appear in ~1 minute.
      </p>
    </form>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  )
}
