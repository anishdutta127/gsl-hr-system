'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/*
 * Real-time, debounced search input for /employees.
 *
 * Replaces the form+Apply pattern: HR types and the URL updates after
 * 300ms; the page server-component re-renders with the filtered list.
 * The URL holds the canonical state so the result is bookmarkable and
 * survives refresh.
 *
 * Why client-side debounce + server-side filter (vs in-memory client
 * filter): the existing list is server-rendered with department filter,
 * probation badge math, and ctcAnnual reads — all of which need server
 * state. Mirroring search to the URL keeps that one source of truth
 * intact without duplicating logic.
 */

const DEBOUNCE_MS = 300

export function EmployeeSearchInput({ initial }: { initial: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initial)
  const lastPushedRef = useRef(initial)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync external URL changes back into the input (e.g. user clicks Clear).
  useEffect(() => {
    const fromUrl = searchParams.get('q') ?? ''
    if (fromUrl !== lastPushedRef.current) {
      lastPushedRef.current = fromUrl
      setValue(fromUrl)
    }
  }, [searchParams])

  function pushUrl(next: string) {
    if (next === lastPushedRef.current) return
    lastPushedRef.current = next
    const sp = new URLSearchParams(searchParams.toString())
    if (next) sp.set('q', next)
    else sp.delete('q')
    const qs = sp.toString()
    router.replace(qs ? `/employees?${qs}` : '/employees', { scroll: false })
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setValue(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => pushUrl(next.trim()), DEBOUNCE_MS)
  }

  function onClear() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setValue('')
    pushUrl('')
  }

  // Cancel pending push on unmount so we don't fire stale navigations.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="relative w-full sm:max-w-md">
      <label htmlFor="employee-search" className="sr-only">
        Search employees
      </label>
      <input
        id="employee-search"
        type="search"
        value={value}
        onChange={onChange}
        placeholder="Search by name, email, employee ID, or department"
        autoComplete="off"
        className="block w-full rounded border border-line-strong bg-card px-3 py-2 pr-9 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-ink-3 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  )
}
