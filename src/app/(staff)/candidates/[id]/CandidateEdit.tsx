'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CANDIDATE_SOURCES, type CandidateSource } from '@/lib/types'

interface Props {
  candidateId: string
  initial: {
    name: string
    email: string
    phone: string
    source: CandidateSource
    notes: string
    programmes: string[]
  }
}

const PROGRAMME_OPTIONS = ['Academics', 'Sales', 'Ops', 'Marketing', 'STEAM']

export function CandidateEdit({ candidateId, initial }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  function toggleProgramme(p: string) {
    setForm((f) => {
      const has = f.programmes.includes(p)
      return {
        ...f,
        programmes: has ? f.programmes.filter((x) => x !== p) : [...f.programmes, p],
      }
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError('Name cannot be empty.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          source: form.source,
          notes: form.notes,
          programmes: form.programmes,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Save failed.' }))
        setError(b.message ?? 'Save failed.')
        setBusy(false)
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError("We couldn't reach our server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        Edit
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="candidate-edit-heading"
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center"
        >
          <div
            ref={dialogRef}
            className="w-full max-w-xl rounded-lg border border-line bg-card p-6 shadow-lg"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id="candidate-edit-heading" className="font-display text-lg text-ink">
                Edit candidate
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-ink-3 hover:text-ink"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div role="alert" className="rounded border border-danger-bg bg-danger-bg px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              <Field label="Name" htmlFor="cand-edit-name">
                <input
                  id="cand-edit-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="cand-edit-email">
                  <input
                    id="cand-edit-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  />
                </Field>

                <Field label="Phone" htmlFor="cand-edit-phone">
                  <input
                    id="cand-edit-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  />
                </Field>
              </div>

              <Field label="Source" htmlFor="cand-edit-source">
                <select
                  id="cand-edit-source"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value as CandidateSource })}
                  className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  {CANDIDATE_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              <fieldset>
                <legend className="mb-1 block text-sm font-medium text-ink">Programme tags</legend>
                <div className="flex flex-wrap gap-2">
                  {PROGRAMME_OPTIONS.map((p) => {
                    const checked = form.programmes.includes(p)
                    return (
                      <label
                        key={p}
                        className={
                          checked
                            ? 'inline-flex min-h-[36px] cursor-pointer items-center rounded border border-teal bg-teal-light px-3 py-1.5 text-sm font-medium text-teal-dark'
                            : 'inline-flex min-h-[36px] cursor-pointer items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm text-ink-2 hover:bg-surface'
                        }
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleProgramme(p)}
                        />
                        {p}
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <Field label="Notes" htmlFor="cand-edit-notes">
                <textarea
                  id="cand-edit-notes"
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                />
              </Field>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded border border-line-strong bg-card px-4 py-2 text-sm text-ink-2 hover:bg-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
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
