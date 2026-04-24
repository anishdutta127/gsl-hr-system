'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RubricCriterion } from '@/lib/types'

type Row = Omit<RubricCriterion, 'id'> & { id: string; tempId?: boolean }

function blank(): Row {
  return {
    id: `tmp-${Math.random().toString(36).slice(2, 10)}`,
    name: '',
    weight: 1,
    scale: 'score-1-10',
    tempId: true,
  }
}

export function RubricEditor({
  roleId,
  initial,
}: {
  roleId: string
  initial: RubricCriterion[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(
    initial.length > 0 ? initial.map((c) => ({ ...c })) : [blank()],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }
  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const criteria: RubricCriterion[] = []
    for (const r of rows) {
      if (!r.name.trim()) continue
      criteria.push({
        id: r.tempId ? `cr-${Math.random().toString(36).slice(2, 10)}` : r.id,
        name: r.name.trim(),
        weight: r.weight > 0 ? r.weight : 1,
        scale: r.scale,
      })
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/roles/${roleId}/rubric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rubric: criteria }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Could not save.' }))
        setError(body.message ?? 'Could not save.')
        setBusy(false)
        return
      }
      router.push(`/roles/${roleId}`)
      router.refresh()
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6" aria-label="Rubric editor">
      <ul className="space-y-3">
        {rows.map((row, i) => (
          <li key={row.id} className="rounded-lg border border-line bg-card p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_120px_180px_auto] md:items-end">
              <div>
                <label htmlFor={`name-${i}`} className="block text-xs font-medium text-ink-2">
                  Criterion
                </label>
                <input
                  id={`name-${i}`}
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  placeholder="e.g., Content depth"
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                />
              </div>
              <div>
                <label htmlFor={`weight-${i}`} className="block text-xs font-medium text-ink-2">
                  Weight
                </label>
                <input
                  id={`weight-${i}`}
                  type="number"
                  min={1}
                  step={1}
                  value={row.weight}
                  onChange={(e) => updateRow(i, { weight: Number(e.target.value) })}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink tabular focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                />
              </div>
              <div>
                <label htmlFor={`scale-${i}`} className="block text-xs font-medium text-ink-2">
                  Scale
                </label>
                <select
                  id={`scale-${i}`}
                  value={row.scale}
                  onChange={(e) =>
                    updateRow(i, { scale: e.target.value as RubricCriterion['scale'] })
                  }
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  <option value="score-1-10">Score 1-10</option>
                  <option value="stars-1-5">Stars 1-5</option>
                  <option value="yes-no">Yes / no</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setRows((r) => [...r, blank()])}
        className="mt-4 inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
      >
        Add criterion
      </button>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2.5 text-base font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save rubric'}
        </button>
      </div>
    </form>
  )
}
