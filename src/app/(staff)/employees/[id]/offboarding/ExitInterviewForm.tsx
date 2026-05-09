'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Initial {
  reasonForLeaving: string
  wouldRecommend: 'Yes' | 'No' | 'Maybe' | null
  satisfactionWithManager: 1 | 2 | 3 | 4 | 5 | null
  satisfactionWithRole: 1 | 2 | 3 | 4 | 5 | null
  topThingsToChange: string
  freeText: string
  conductedAt?: string
  conductedBy?: string
}

export function ExitInterviewForm({
  employeeId,
  initial,
  canEdit,
}: {
  employeeId: string
  initial: Initial
  canEdit: boolean
}) {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const router = useRouter()

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const res = await fetch(
        `/api/admin/offboarding/exit-interview/${encodeURIComponent(employeeId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      )
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Save failed: ${res.status}`)
      setStatusMsg(data.note ?? 'Saved.')
      setTimeout(() => setStatusMsg(null), 12000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-line bg-card p-5">
      {form.conductedAt && (
        <p className="mb-3 text-xs text-ink-3">
          First conducted {form.conductedAt.slice(0, 10)} by {form.conductedBy}. Subsequent edits
          add audit entries.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Reason for leaving" full>
          <textarea
            value={form.reasonForLeaving}
            onChange={(e) => setForm((f) => ({ ...f, reasonForLeaving: e.target.value }))}
            rows={3}
            disabled={!canEdit || busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Would recommend GSL?">
          <select
            value={form.wouldRecommend ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                wouldRecommend: (e.target.value || null) as Initial['wouldRecommend'],
              }))
            }
            disabled={!canEdit || busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            <option value="Yes">Yes</option>
            <option value="Maybe">Maybe</option>
            <option value="No">No</option>
          </select>
        </Field>
        <Field label="Satisfaction with manager (1-5)">
          <select
            value={form.satisfactionWithManager ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                satisfactionWithManager: e.target.value
                  ? (Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
                  : null,
              }))
            }
            disabled={!canEdit || busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Satisfaction with role (1-5)">
          <select
            value={form.satisfactionWithRole ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                satisfactionWithRole: e.target.value
                  ? (Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
                  : null,
              }))
            }
            disabled={!canEdit || busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Top 3 things you would change" full>
          <textarea
            value={form.topThingsToChange}
            onChange={(e) => setForm((f) => ({ ...f, topThingsToChange: e.target.value }))}
            rows={3}
            disabled={!canEdit || busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Other notes / free text" full>
          <textarea
            value={form.freeText}
            onChange={(e) => setForm((f) => ({ ...f, freeText: e.target.value }))}
            rows={4}
            disabled={!canEdit || busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
        {canEdit && (
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save exit interview'}
            </button>
            {statusMsg && (
              <span role="status" aria-live="polite" className="text-xs text-ink-2">
                {statusMsg}
              </span>
            )}
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        )}
      </div>
    </form>
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
