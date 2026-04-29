'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OnboardingItem } from '@/lib/types'
import { useOptimisticAction } from '@/lib/hooks/useOptimisticAction'

type ItemMap = Record<string, boolean>

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
  const initial = useMemo<ItemMap>(() => {
    const m: ItemMap = {}
    for (const i of items) m[i.id] = i.done
    return m
  }, [items])
  const action = useOptimisticAction<ItemMap>(initial)
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function toggle(item: OnboardingItem) {
    if (!canEdit) return
    setPendingId(item.id)
    const next: ItemMap = { ...action.current, [item.id]: !action.current[item.id] }
    const res = await action.run({
      optimistic: next,
      perform: async () => {
        const r = await fetch(`/api/employees/${employeeId}/onboarding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: item.id, done: next[item.id] }),
        })
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { message?: string }
          throw new Error(b.message ?? 'Could not save.')
        }
        return r.json()
      },
    })
    setPendingId(null)
    if (res.ok) router.refresh()
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
        No checklist items yet.
      </div>
    )
  }

  const total = items.length
  const done = items.reduce((acc, i) => acc + (action.current[i.id] ? 1 : 0), 0)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm text-ink-2">
        <span>
          {done} of {total} complete
        </span>
        <span className="text-xs text-ink-3">{Math.round((done / total) * 100)}%</span>
      </div>
      {action.error && (
        <div
          role="alert"
          className="mb-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {action.error}
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {items.map((item) => {
          const isDone = action.current[item.id] ?? false
          return (
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
                  checked={isDone}
                  disabled={!canEdit || pendingId === item.id}
                  onChange={() => toggle(item)}
                  className="mt-0.5 h-5 w-5 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
                />
                <span className="flex-1">
                  <span className={isDone ? 'text-ink-2 line-through' : 'text-ink'}>
                    {item.label}
                  </span>
                  {isDone && item.doneAt ? (
                    <span className="ml-2 text-xs text-ink-3">
                      {new Date(item.doneAt).toLocaleDateString('en-IN')}
                      {item.doneBy ? ` · ${item.doneBy}` : ''}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
