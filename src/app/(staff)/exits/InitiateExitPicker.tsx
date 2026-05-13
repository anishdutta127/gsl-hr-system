'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

/*
 * Active-employee picker shown on /exits so HR can start an exit without
 * having to know they need to navigate to /employees first. The actual
 * exit flow lives on the employee detail page (ExitInitiator), so this
 * is a discoverability widget - type a name, jump straight to the
 * employee's exit form.
 *
 * Why a client component: HR may type partial names ("ko" → "Komal")
 * and we want suggestions without a server round-trip. Filter is in
 * memory over the active-employee list passed in by the server page.
 */

export interface PickerEmployee {
  id: string
  name: string
  designation: string | null
  department: string | null
  employeeCode: string | null
}

export function InitiateExitPicker({ employees }: { employees: PickerEmployee[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return employees.slice(0, 10)
    return employees
      .filter((e) => {
        const hay = [e.name, e.designation, e.department, e.employeeCode]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 25)
  }, [employees, query])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
      >
        Initiate exit for an employee
      </button>
    )
  }

  return (
    <section
      aria-label="Initiate exit"
      className="rounded-lg border border-line bg-card p-5"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink">Initiate exit</h2>
          <p className="mt-1 text-xs text-ink-2">
            Pick the employee. The exit form opens on their detail page (last
            working day, reason, notes), and the offboarding tasks generate
            automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setQuery('')
          }}
          className="text-xs text-ink-2 hover:text-ink"
        >
          Close
        </button>
      </div>
      <label htmlFor="exit-picker" className="sr-only">
        Search active employees
      </label>
      <input
        id="exit-picker"
        type="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a name, code, designation, or department"
        className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />

      {matches.length === 0 ? (
        <p className="mt-3 text-xs text-ink-3">
          No active employees match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto rounded border border-line">
          {matches.map((e) => (
            <li key={e.id}>
              <Link
                href={`/employees/${e.id}#exit`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
              >
                <span>
                  <span className="block font-medium text-ink">{e.name}</span>
                  <span className="block text-xs text-ink-2">
                    {[e.designation, e.department, e.employeeCode]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-navy">
                  Open →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!query && employees.length > 10 && (
        <p className="mt-2 text-[11px] text-ink-3">
          Showing the first 10 of {employees.length.toLocaleString('en-IN')} active
          employees. Type to narrow.
        </p>
      )}
    </section>
  )
}
