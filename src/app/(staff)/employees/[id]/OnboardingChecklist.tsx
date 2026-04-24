'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { OnboardingItem } from '@/lib/types'

export function OnboardingChecklist({
  employeeId,
  items,
  canEdit,
}: {
  employeeId: string
  items: OnboardingItem[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function toggle(item: OnboardingItem) {
    if (!canEdit) return
    setPendingId(item.id)
    setError(null)
    try {
      const res = await fetch(`/api/employees/${employeeId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, done: !item.done }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed.' }))
        setError(body.message ?? 'Failed.')
        setPendingId(null)
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
    } finally {
      setPendingId(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
        No checklist items yet.
      </div>
    )
  }

  const done = items.filter((i) => i.done).length
  const total = items.length

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm text-ink-2">
        <span>
          {done} of {total} complete
        </span>
        <span className="text-xs text-ink-3">{Math.round((done / total) * 100)}%</span>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {items.map((item) => (
          <li key={item.id}>
            <label
              className={
                canEdit
                  ? 'flex cursor-pointer items-start gap-3 px-5 py-3 text-sm hover:bg-surface'
                  : 'flex items-start gap-3 px-5 py-3 text-sm'
              }
            >
              <input
                type="checkbox"
                checked={item.done}
                disabled={!canEdit || pendingId === item.id}
                onChange={() => toggle(item)}
                className="mt-0.5 h-5 w-5 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
              />
              <span className="flex-1">
                <span className={item.done ? 'text-ink-2 line-through' : 'text-ink'}>
                  {item.label}
                </span>
                {item.done && item.doneAt ? (
                  <span className="ml-2 text-xs text-ink-3">
                    {new Date(item.doneAt).toLocaleDateString('en-IN')}
                    {item.doneBy ? ` · ${item.doneBy}` : ''}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
