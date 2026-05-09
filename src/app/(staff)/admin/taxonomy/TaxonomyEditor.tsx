'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DepartmentView, LocationView } from '@/lib/taxonomy'
import type { LocationType } from '@/lib/types'

interface Props {
  locations: LocationView[]
  departments: DepartmentView[]
}

export function TaxonomyEditor({ locations, departments }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Locations" hint="Mumbai and Kolkata are formal offices. Everything else is remote-field unless promoted.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Active</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => (
              <LocationRow key={loc.name} loc={loc} />
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Departments" hint='Flagged rows need confirmation. "Demonstration & Support" was flagged on import.'>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2 text-right">Active</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => (
              <DepartmentRow key={dept.name} dept={dept} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function Card({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-card">
      <header className="border-b border-line px-5 py-4">
        <h2 className="font-display text-lg text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-2">{hint}</p>
      </header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

function LocationRow({ loc }: { loc: LocationView }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(loc.name)
  const [type, setType] = useState<LocationType>(loc.type)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (type !== loc.type) {
        await postJson('/api/admin/taxonomy', {
          kind: 'location',
          operation: 'retype',
          name: loc.name,
          type,
        })
      }
      if (name.trim() && name.trim() !== loc.name) {
        await postJson('/api/admin/taxonomy', {
          kind: 'location',
          operation: 'rename',
          from: loc.name,
          to: name.trim(),
        })
      }
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-b border-line/50">
      <td className="px-3 py-2">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-line-strong bg-card px-2 py-1 text-sm"
            disabled={busy}
            aria-label={`Rename ${loc.name}`}
          />
        ) : (
          <span className="font-medium text-ink">{loc.name}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LocationType)}
            className="rounded border border-line-strong bg-card px-2 py-1 text-sm"
            disabled={busy}
            aria-label={`Type for ${loc.name}`}
          >
            <option value="office">Office</option>
            <option value="remote-field">Remote / field</option>
          </select>
        ) : (
          <span
            className={
              loc.type === 'office'
                ? 'rounded-sm bg-orange-light px-2 py-0.5 text-xs font-medium text-orange-dark'
                : 'rounded-sm bg-surface px-2 py-0.5 text-xs text-ink-3'
            }
          >
            {loc.type === 'office' ? 'Office' : 'Remote / field'}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular text-ink">{loc.count}</td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <div className="flex justify-end gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-navy px-3 py-1 text-xs font-medium text-white hover:bg-navy-dark disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setName(loc.name)
                setType(loc.type)
                setError(null)
              }}
              disabled={busy}
              className="rounded border border-line-strong px-3 py-1 text-xs text-ink-2 hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-navy hover:text-navy-dark"
          >
            Edit
          </button>
        )}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </td>
    </tr>
  )
}

function DepartmentRow({ dept }: { dept: DepartmentView }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(dept.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (name.trim() && name.trim() !== dept.name) {
        await postJson('/api/admin/taxonomy', {
          kind: 'department',
          operation: 'rename',
          from: dept.name,
          to: name.trim(),
        })
      }
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-b border-line/50">
      <td className="px-3 py-2">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-line-strong bg-card px-2 py-1 text-sm"
            disabled={busy}
            aria-label={`Rename ${dept.name}`}
          />
        ) : (
          <span className="font-medium text-ink">
            {dept.name}
            {dept.flagged && (
              <span
                className="ml-2 rounded-sm bg-warning-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning"
                title={dept.notes ?? 'Flagged for review'}
              >
                Flagged
              </span>
            )}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular text-ink">{dept.count}</td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <div className="flex justify-end gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-navy px-3 py-1 text-xs font-medium text-white hover:bg-navy-dark disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setName(dept.name)
                setError(null)
              }}
              disabled={busy}
              className="rounded border border-line-strong px-3 py-1 text-xs text-ink-2 hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-navy hover:text-navy-dark"
          >
            Edit
          </button>
        )}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </td>
    </tr>
  )
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(data.message ?? `Request failed: ${res.status}`)
  }
}
