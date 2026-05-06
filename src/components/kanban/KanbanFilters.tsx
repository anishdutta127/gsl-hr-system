'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FILTER_KEYS, type FilterKey } from '@/lib/kanbanFilters'

export { applyFilters, parseFiltersFromQuery, FILTER_KEYS } from '@/lib/kanbanFilters'
export type { FilterKey } from '@/lib/kanbanFilters'

interface ChipDef {
  key: FilterKey
  label: string
  description: string
}

const CHIPS: ChipDef[] = [
  { key: 'stale', label: 'Stale', description: 'No movement in the last 7 days' },
  { key: 'mine', label: 'My adds', description: 'Candidates I added' },
  { key: 'new', label: 'New this week', description: 'Created in the last 7 days' },
  {
    key: 'mineToAction',
    label: 'Mine to action',
    description: 'Assigned to me with no action in 3 days',
  },
]

interface Props {
  value: FilterKey[]
  onChange: (next: FilterKey[]) => void
  currentUserEmail: string
}

const QUERY_PARAM = 'filters'

export function KanbanFilters({ value, onChange, currentUserEmail }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Sync URL whenever filters change. Use replace so back-button stays useful.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (value.length === 0) params.delete(QUERY_PARAM)
    else params.set(QUERY_PARAM, value.join(','))
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function toggle(key: FilterKey) {
    if (value.includes(key)) onChange(value.filter((v) => v !== key))
    else onChange([...value, key])
  }

  // Suppress unused-import lint by referencing FILTER_KEYS once.
  void FILTER_KEYS

  return (
    <div
      role="toolbar"
      aria-label="Pipeline filters"
      className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-card px-4 py-2"
    >
      <span className="text-xs font-medium text-ink-2">Filters</span>
      <button
        type="button"
        onClick={() => onChange([])}
        aria-pressed={value.length === 0}
        className={`inline-flex min-h-[28px] items-center rounded-full px-3 py-1 text-xs font-medium ${
          value.length === 0
            ? 'bg-navy text-white'
            : 'border border-line-strong bg-card text-ink hover:bg-surface'
        }`}
      >
        All
      </button>
      {CHIPS.map((c) => {
        const on = value.includes(c.key)
        const disabled = c.key === 'mine' || c.key === 'mineToAction' ? !currentUserEmail : false
        return (
          <button
            key={c.key}
            type="button"
            disabled={disabled}
            onClick={() => toggle(c.key)}
            aria-pressed={on}
            title={
              disabled
                ? 'Sign-in required to use this filter.'
                : c.description
            }
            className={`inline-flex min-h-[28px] items-center rounded-full px-3 py-1 text-xs font-medium ${
              on
                ? 'bg-teal text-white'
                : 'border border-line-strong bg-card text-ink hover:bg-surface'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {c.label}
          </button>
        )
      })}
    </div>
  )
}
