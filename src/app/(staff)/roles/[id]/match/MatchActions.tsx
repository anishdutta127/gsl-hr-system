'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface MatchOption {
  id: string
  name: string
  email: string
  score: number
  reasons: string[]
  alreadyInPipeline: boolean
  programmes: string[]
}

export function MatchActions({
  roleId,
  roleTitle,
  matches,
}: {
  roleId: string
  roleTitle: string
  matches: MatchOption[]
}) {
  const router = useRouter()
  const defaultSelection = new Set(matches.filter((m) => !m.alreadyInPipeline && m.score >= 40).map((m) => m.id))
  const [selected, setSelected] = useState<Set<string>>(defaultSelection)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function addSelectedToPipeline() {
    if (selected.size === 0) {
      setError('Select at least one candidate.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/candidates/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateIds: Array.from(selected),
          action: { type: 'add-to-pipeline', roleId },
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Failed.' }))
        setError(b.message ?? 'Failed.')
        setBusy(false)
        return
      }
      const data = (await res.json()) as { applied: number; skipped: number; errors: number }
      setSuccess(
        `Added ${data.applied} to ${roleTitle}${data.skipped > 0 ? `, skipped ${data.skipped} (already in pipeline)` : ''}.`,
      )
      setSelected(new Set())
      router.refresh()
    } catch {
      setError("We couldn't reach our server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {(success || error) && (
        <div
          role={error ? 'alert' : 'status'}
          className={
            error
              ? 'mt-4 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger'
              : 'mt-4 rounded border border-teal bg-teal-light px-3 py-2 text-sm text-teal-dark'
          }
        >
          {error ?? success}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card px-5 py-3">
        <div className="text-sm text-ink">
          <span className="font-medium">{selected.size}</span> of {matches.length} selected
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addSelectedToPipeline}
            disabled={busy || selected.size === 0}
            className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60"
          >
            {busy ? 'Adding…' : `Add ${selected.size} to pipeline`}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
          >
            Clear
          </button>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {matches.map((m) => (
          <li key={m.id} className="flex items-start gap-3 px-5 py-3 text-sm">
            <input
              type="checkbox"
              aria-label={`Select ${m.name}`}
              checked={selected.has(m.id)}
              onChange={() => toggleOne(m.id)}
              disabled={m.alreadyInPipeline}
              className="mt-0.5 h-4 w-4 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-40"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/candidates/${m.id}`}
                  className="font-medium text-ink hover:text-navy"
                >
                  {m.name}
                </Link>
                <span className="inline-flex items-center rounded bg-surface px-2 py-0.5 text-xs tabular text-ink-2">
                  score {m.score}
                </span>
                {m.alreadyInPipeline && (
                  <span className="inline-flex items-center rounded bg-teal-light px-2 py-0.5 text-xs font-medium text-teal-dark">
                    already in pipeline
                  </span>
                )}
                {m.programmes.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center rounded bg-surface px-2 py-0.5 text-xs text-ink-2"
                  >
                    {p}
                  </span>
                ))}
              </div>
              <div className="mt-0.5 text-xs text-ink-2">
                {m.email || 'no email on file'}
              </div>
              {m.reasons.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-ink-3">
                  {m.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-ink-3">
        Candidates with score ≥ 40 and not already in this pipeline are pre-selected. Uncheck any
        you don't want before adding.
      </p>
    </>
  )
}
