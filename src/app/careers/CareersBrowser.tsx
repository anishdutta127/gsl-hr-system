'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'

type Filter = 'team' | 'location' | 'type'

export function CareersBrowser({ roles }: { roles: Role[] }) {
  const [team, setTeam] = useState<string>('all')
  const [location, setLocation] = useState<string>('all')
  const [type, setType] = useState<string>('all')

  const teams = useMemo(() => unique(roles.map((r) => r.department)).sort(), [roles])
  const locations = useMemo(() => unique(roles.map((r) => r.location)).sort(), [roles])
  const types = useMemo(() => unique(roles.map((r) => r.employmentType)).sort(), [roles])

  const filtered = useMemo(
    () =>
      roles.filter((r) => {
        if (team !== 'all' && r.department !== team) return false
        if (location !== 'all' && r.location !== location) return false
        if (type !== 'all' && r.employmentType !== type) return false
        return true
      }),
    [roles, team, location, type],
  )

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3" role="group" aria-label="Filters">
        <ChipGroup label="Team" value={team} options={teams} onChange={setTeam} />
        <ChipGroup label="Location" value={location} options={locations} onChange={setLocation} />
        <ChipGroup label="Role type" value={type} options={types} onChange={setType} />
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center text-sm text-ink-2">
          No roles match those filters. Clear a filter to see more.
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
          {filtered.map((role) => (
            <li key={role.id}>
              <Link
                href={`/careers/${role.id}`}
                className="block px-5 py-5 hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-display text-lg text-ink">{role.title}</div>
                    <div className="mt-1 text-xs text-ink-2">
                      {role.department} · {role.location} · {role.employmentType}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-navy">View →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ChipGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div>
      <span className="mr-2 text-xs font-medium uppercase tracking-wider text-ink-3">{label}</span>
      <Chip label="All" active={value === 'all'} onClick={() => onChange('all')} />
      {options.map((o) => (
        <Chip key={o} label={o} active={value === o} onClick={() => onChange(o)} />
      ))}
    </div>
  )
}

function Chip({
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
          ? 'mr-2 mt-1 inline-flex items-center rounded-full bg-navy px-3 py-1 text-xs font-medium text-white'
          : 'mr-2 mt-1 inline-flex items-center rounded-full border border-line-strong bg-card px-3 py-1 text-xs text-ink-2 hover:border-navy hover:text-navy'
      }
    >
      {label}
    </button>
  )
}

function unique<T>(list: T[]): T[] {
  return Array.from(new Set(list))
}
