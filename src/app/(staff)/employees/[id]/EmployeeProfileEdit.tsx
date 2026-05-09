'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WORK_PATTERNS, type WorkPattern } from '@/lib/types'

interface Initial {
  title: string | null
  phone: string | null
  location: string
  workPattern: WorkPattern
  reportingTo: string | null
  address: string | null
  personalEmail: string | null
  gender: string | null
  maritalStatus: string | null
}

const PATTERN_LABEL: Record<WorkPattern, string> = {
  'office-5day': 'Office 5-day (Mon-Fri)',
  'trainer-6day': 'Trainer 6-day (Mon-Sat)',
  'hybrid-2day': 'Hybrid 2-day',
  field: 'Field (no office expected)',
  remote: 'Remote',
}

export function EmployeeProfileEdit({
  employeeId,
  initial,
  knownLocations,
}: {
  employeeId: string
  initial: Initial
  knownLocations: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [form, setForm] = useState(initial)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function reset() {
    setForm(initial)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) {
        throw new Error(data.message ?? `Save failed: ${res.status}`)
      }
      setStatusMsg(data.note ?? 'Saved.')
      setTimeout(() => setStatusMsg(null), 12000)
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div>
        <button
          onClick={() => {
            setOpen(true)
            reset()
          }}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          Edit profile
        </button>
        {statusMsg && (
          <p role="status" aria-live="polite" className="mt-2 text-xs text-ink-2">
            {statusMsg}
          </p>
        )}
      </div>
    )
  }

  return (
    <div ref={dialogRef} className="rounded-lg border border-line bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg text-ink">Edit profile</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            reset()
          }}
          className="text-xs font-medium text-ink-3 hover:text-ink"
        >
          Cancel
        </button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Title">
          <select
            value={form.title ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value || null }))}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
          >
            <option value="">—</option>
            <option value="Mr.">Mr.</option>
            <option value="Mrs.">Mrs.</option>
            <option value="Ms.">Ms.</option>
            <option value="Dr.">Dr.</option>
          </select>
        </Field>
        <Field label="Mobile">
          <input
            value={form.phone ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value || null }))}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
            placeholder="+91-9XXXXXXXXX"
            inputMode="tel"
          />
        </Field>
        <Field label="Location">
          <input
            list="known-locations"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
          />
          <datalist id="known-locations">
            {knownLocations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="Work pattern">
          <select
            value={form.workPattern}
            onChange={(e) => setForm((f) => ({ ...f, workPattern: e.target.value as WorkPattern }))}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
          >
            {WORK_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reporting to (free text name)" full>
          <input
            value={form.reportingTo ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, reportingTo: e.target.value || null }))}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
            placeholder="Manager's full name"
          />
          <p className="mt-1 text-xs text-ink-3">
            We try to match this name to a known employee. If no match, the manager link stays
            empty and the audit log notes it.
          </p>
        </Field>
        <Field label="Personal email">
          <input
            type="email"
            value={form.personalEmail ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, personalEmail: e.target.value || null }))
            }
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
          />
        </Field>
        <Field label="Gender">
          <select
            value={form.gender ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value || null }))}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
          >
            <option value="">—</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Marital status">
          <select
            value={form.maritalStatus ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, maritalStatus: e.target.value || null }))
            }
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
          >
            <option value="">—</option>
            <option value="Single">Single</option>
            <option value="Unmarried">Unmarried</option>
            <option value="Married">Married</option>
            <option value="Other">Other</option>
          </select>
        </Field>
        <Field label="Address" full>
          <textarea
            value={form.address ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value || null }))}
            rows={2}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            disabled={busy}
          />
        </Field>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save profile'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              reset()
            }}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm text-ink-2 hover:bg-surface"
          >
            Cancel
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  full,
  children,
}: {
  label: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
