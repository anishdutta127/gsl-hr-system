'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Application, Role, RubricCriterion } from '@/lib/types'
import { aggregateScore } from '@/lib/rubric'

type ScoreState = Record<string, number | 'yes' | 'no'>

export function InterviewForm({
  application,
  role,
  round,
}: {
  application: Application
  role: Role
  round: string
}) {
  const router = useRouter()
  const [scores, setScores] = useState<ScoreState>({})
  const [notes, setNotes] = useState('')
  const [recommendation, setRecommendation] = useState<'proceed' | 'hold' | 'reject'>('proceed')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const aggregate = useMemo(() => {
    const arr = Object.entries(scores).map(([criterionId, value]) => ({ criterionId, value }))
    return aggregateScore(role.rubric, arr)
  }, [role.rubric, scores])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const body = {
        applicationId: application.id,
        round,
        scores: Object.entries(scores).map(([criterionId, value]) => ({ criterionId, value })),
        notes: notes.trim(),
        recommendation,
        aggregateScore: aggregate,
      }
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Could not save.' }))
        setError(data.message ?? 'Could not save.')
        setBusy(false)
        return
      }
      router.push(`/candidates/${application.candidateId}`)
      router.refresh()
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]"
      aria-label={`${round} interview form`}
    >
      <div className="space-y-4">
        {role.rubric.length > 0 && (
          <section className="rounded-lg border border-line bg-card p-5">
            <h2 className="mb-4 font-display text-lg text-ink">Rubric</h2>
            <div className="space-y-4">
              {role.rubric.map((criterion) => (
                <CriterionRow
                  key={criterion.id}
                  criterion={criterion}
                  value={scores[criterion.id]}
                  onChange={(v) =>
                    setScores((prev) => ({ ...prev, [criterion.id]: v }))
                  }
                />
              ))}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-line bg-card p-5">
          <label htmlFor="notes" className="block font-display text-lg text-ink">
            Notes
          </label>
          <p className="mt-1 text-xs text-ink-2">
            Specific, honest. Avoid generic filler.
          </p>
          <textarea
            id="notes"
            rows={10}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-3 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </section>

        <section className="rounded-lg border border-line bg-card p-5">
          <fieldset>
            <legend className="font-display text-lg text-ink">Recommendation</legend>
            <div className="mt-3 space-y-2">
              <RadioOption
                name="recommendation"
                value="proceed"
                label="Proceed to next stage"
                checked={recommendation === 'proceed'}
                onChange={(v) => setRecommendation(v as 'proceed')}
              />
              <RadioOption
                name="recommendation"
                value="hold"
                label="Put on hold"
                checked={recommendation === 'hold'}
                onChange={(v) => setRecommendation(v as 'hold')}
              />
              <RadioOption
                name="recommendation"
                value="reject"
                label="Reject"
                checked={recommendation === 'reject'}
                onChange={(v) => setRecommendation(v as 'reject')}
              />
            </div>
          </fieldset>
        </section>
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="rounded-lg border border-line bg-card p-5">
          <h2 className="font-display text-lg text-ink">Summary</h2>
          <div className="mt-3 text-sm text-ink-2">
            <div>Round: {round}</div>
            <div className="mt-1">
              Aggregate score:{' '}
              <span className="font-medium text-ink tabular">
                {aggregate != null ? `${aggregate} / 10` : '-'}
              </span>
            </div>
            <div className="mt-1">
              Recommendation: <span className="font-medium text-ink">{recommendation}</span>
            </div>
          </div>
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
            className="mt-4 w-full rounded bg-navy px-4 py-2.5 text-base font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save interview'}
          </button>
          <p className="mt-3 text-xs text-ink-3">
            Saving advances the stage based on your recommendation.
          </p>
        </div>
      </aside>
    </form>
  )
}

function CriterionRow({
  criterion,
  value,
  onChange,
}: {
  criterion: RubricCriterion
  value: number | 'yes' | 'no' | undefined
  onChange: (value: number | 'yes' | 'no') => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={`c-${criterion.id}`} className="text-sm font-medium text-ink">
          {criterion.name}
          <span className="ml-2 text-xs font-normal text-ink-3">
            weight {criterion.weight}
          </span>
        </label>
        <span className="text-xs text-ink-3">{criterion.scale}</span>
      </div>
      {criterion.scale === 'yes-no' ? (
        <div className="mt-2 flex gap-2" role="radiogroup" aria-labelledby={`label-${criterion.id}`}>
          <ToggleChip
            label="Yes"
            active={value === 'yes'}
            onClick={() => onChange('yes')}
          />
          <ToggleChip
            label="No"
            active={value === 'no'}
            onClick={() => onChange('no')}
          />
        </div>
      ) : (
        <input
          id={`c-${criterion.id}`}
          type="number"
          min={criterion.scale === 'stars-1-5' ? 1 : 1}
          max={criterion.scale === 'stars-1-5' ? 5 : 10}
          step={1}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(n)
          }}
          className="mt-2 block w-32 rounded border border-line-strong bg-card px-3 py-2 text-base text-ink tabular focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      )}
    </div>
  )
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'inline-flex min-h-[44px] items-center rounded-full bg-navy px-4 py-2 text-sm font-medium text-white'
          : 'inline-flex min-h-[44px] items-center rounded-full border border-line-strong bg-card px-4 py-2 text-sm text-ink-2 hover:border-navy hover:text-navy'
      }
    >
      {label}
    </button>
  )
}

function RadioOption({
  name,
  value,
  label,
  checked,
  onChange,
}: {
  name: string
  value: string
  label: string
  checked: boolean
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-ink">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="h-4 w-4 border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
      />
      {label}
    </label>
  )
}
