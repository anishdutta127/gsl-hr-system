'use client'

/*
 * Edit a role's details in place.
 *
 * WHY: before this existed, the only way to correct a job title was to delete
 * the role and recreate it - which orphans every application attached to it.
 * HR asked for the title specifically; the whole editable surface is here so
 * the request does not come back one field at a time.
 *
 * Editing never writes `pipelineStages` and never touches applications:
 * applications key on the role id, which is immutable, so in-flight
 * candidates and their stage survive a rename untouched.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ROLE_DEPARTMENTS,
  ROLE_EMPLOYMENT_TYPES,
  ROLE_LOCATIONS,
  ROLE_TITLE_MAX_LENGTH,
} from '@/lib/roles/editableFields'
import type { Role } from '@/lib/types'

export interface HodOption {
  id: string
  name: string
}

type Draft = {
  title: string
  department: string
  location: string
  employmentType: string
  hodUserId: string
  hodRound2UserId: string
  salaryMin: string
  salaryMax: string
  salaryPeriod: 'annual' | 'monthly'
  salaryDisclose: boolean
  responsibilities: string
  mustHaves: string
  niceToHaves: string
}

function toDraft(role: Role): Draft {
  return {
    title: role.title ?? '',
    department: role.department ?? '',
    location: role.location ?? '',
    employmentType: role.employmentType ?? 'Full-time',
    hodUserId: role.hodUserId ?? '',
    hodRound2UserId: role.hodRound2UserId ?? '',
    salaryMin: role.salaryRange ? String(role.salaryRange.min) : '',
    salaryMax: role.salaryRange ? String(role.salaryRange.max) : '',
    salaryPeriod: role.salaryRange?.period ?? 'annual',
    salaryDisclose: role.salaryRange?.disclose ?? false,
    responsibilities: (role.responsibilities ?? []).join('\n'),
    mustHaves: (role.mustHaves ?? []).join('\n'),
    niceToHaves: (role.niceToHaves ?? []).join('\n'),
  }
}

function toLines(value: string): string[] {
  return value
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

export function RoleDetailsEdit({ role, hodOptions }: { role: Role; hodOptions: HodOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(() => toDraft(role))
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const ids = useId()

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      triggerRef.current?.focus()
    }
  }, [open])

  async function handleSave() {
    setError(null)

    const title = draft.title.trim()
    if (!title) {
      setError('Role title is required.')
      return
    }
    if (title.length > ROLE_TITLE_MAX_LENGTH) {
      setError(`Role title is too long (max ${ROLE_TITLE_MAX_LENGTH} characters).`)
      return
    }

    const hasSalary = draft.salaryMin.trim() !== '' || draft.salaryMax.trim() !== ''
    let salaryRange: unknown = null
    if (hasSalary) {
      const min = Number(draft.salaryMin)
      const max = Number(draft.salaryMax)
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        setError('Salary minimum and maximum must both be numbers.')
        return
      }
      if (min > max) {
        setError('Salary minimum cannot exceed the maximum.')
        return
      }
      salaryRange = {
        min,
        max,
        currency: 'INR',
        period: draft.salaryPeriod,
        disclose: draft.salaryDisclose,
      }
    }

    setBusy(true)
    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          department: draft.department.trim(),
          location: draft.location.trim(),
          employmentType: draft.employmentType,
          hodUserId: draft.hodUserId || null,
          hodRound2UserId: draft.hodRound2UserId || null,
          salaryRange,
          responsibilities: toLines(draft.responsibilities),
          mustHaves: toLines(draft.mustHaves),
          niceToHaves: toLines(draft.niceToHaves),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        setError(body.message ?? 'Could not save the changes.')
        setBusy(false)
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('We could not reach the server. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setDraft(toDraft(role))
          setError(null)
          setOpen(true)
        }}
        className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        Edit details
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${ids}-heading`}
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
        >
          <div
            ref={dialogRef}
            className="flex h-[92vh] w-full max-w-2xl flex-col rounded-t-lg border border-line bg-card shadow-lg sm:h-[min(88vh,760px)] sm:rounded-lg"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
              <div>
                <h2 id={`${ids}-heading`} className="font-display text-lg text-ink">
                  Edit role details
                </h2>
                <p className="mt-0.5 text-xs text-ink-2">
                  Candidates already in this pipeline are not affected.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="min-h-[44px] px-2 text-ink-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              >
                ×
              </button>
            </header>

            <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
              {error && (
                <div
                  role="alert"
                  className="rounded border border-danger-bg bg-danger-bg px-3 py-2 text-sm text-danger"
                >
                  {error}
                </div>
              )}

              <label htmlFor={`${ids}-title`} className="block">
                <span className="mb-1 block text-sm font-medium text-ink">Job title</span>
                <input
                  id={`${ids}-title`}
                  type="text"
                  value={draft.title}
                  maxLength={ROLE_TITLE_MAX_LENGTH}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className={inputClass}
                />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label htmlFor={`${ids}-department`} className="block">
                  <span className="mb-1 block text-sm font-medium text-ink">Department</span>
                  <input
                    id={`${ids}-department`}
                    type="text"
                    list={`${ids}-departments`}
                    value={draft.department}
                    onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                    className={inputClass}
                  />
                  <datalist id={`${ids}-departments`}>
                    {ROLE_DEPARTMENTS.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </label>

                <label htmlFor={`${ids}-location`} className="block">
                  <span className="mb-1 block text-sm font-medium text-ink">Location</span>
                  <input
                    id={`${ids}-location`}
                    type="text"
                    list={`${ids}-locations`}
                    value={draft.location}
                    onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                    className={inputClass}
                  />
                  <datalist id={`${ids}-locations`}>
                    {ROLE_LOCATIONS.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </label>
              </div>

              <label htmlFor={`${ids}-employmentType`} className="block">
                <span className="mb-1 block text-sm font-medium text-ink">Employment type</span>
                <select
                  id={`${ids}-employmentType`}
                  value={draft.employmentType}
                  onChange={(e) => setDraft({ ...draft, employmentType: e.target.value })}
                  className={inputClass}
                >
                  {ROLE_EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label htmlFor={`${ids}-hod`} className="block">
                  <span className="mb-1 block text-sm font-medium text-ink">Hiring manager</span>
                  <select
                    id={`${ids}-hod`}
                    value={draft.hodUserId}
                    onChange={(e) => setDraft({ ...draft, hodUserId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Not assigned</option>
                    {hodOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label htmlFor={`${ids}-hod2`} className="block">
                  <span className="mb-1 block text-sm font-medium text-ink">
                    Second reviewer (optional)
                  </span>
                  <select
                    id={`${ids}-hod2`}
                    value={draft.hodRound2UserId}
                    onChange={(e) => setDraft({ ...draft, hodRound2UserId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Not assigned</option>
                    {hodOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset className="rounded border border-line p-3">
                <legend className="px-1 text-sm font-medium text-ink">Salary range</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label htmlFor={`${ids}-salaryMin`} className="block">
                    <span className="mb-1 block text-sm text-ink-2">Minimum (Rs)</span>
                    <input
                      id={`${ids}-salaryMin`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={draft.salaryMin}
                      onChange={(e) => setDraft({ ...draft, salaryMin: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label htmlFor={`${ids}-salaryMax`} className="block">
                    <span className="mb-1 block text-sm text-ink-2">Maximum (Rs)</span>
                    <input
                      id={`${ids}-salaryMax`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={draft.salaryMax}
                      onChange={(e) => setDraft({ ...draft, salaryMax: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label htmlFor={`${ids}-salaryPeriod`} className="block">
                    <span className="mb-1 block text-sm text-ink-2">Period</span>
                    <select
                      id={`${ids}-salaryPeriod`}
                      value={draft.salaryPeriod}
                      onChange={(e) =>
                        setDraft({ ...draft, salaryPeriod: e.target.value as 'annual' | 'monthly' })
                      }
                      className={inputClass}
                    >
                      <option value="annual">Annual</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                  <label
                    htmlFor={`${ids}-salaryDisclose`}
                    className="flex items-center gap-2 pt-6 text-sm text-ink"
                  >
                    <input
                      id={`${ids}-salaryDisclose`}
                      type="checkbox"
                      checked={draft.salaryDisclose}
                      onChange={(e) => setDraft({ ...draft, salaryDisclose: e.target.checked })}
                      className="h-4 w-4 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
                    />
                    Show this range on the careers page
                  </label>
                </div>
                <p className="mt-2 text-xs text-ink-2">
                  Leave both blank to remove the range. When hidden, the careers page shows
                  "Shared at first interview."
                </p>
              </fieldset>

              {(
                [
                  ['responsibilities', 'Responsibilities'],
                  ['mustHaves', 'Must haves'],
                  ['niceToHaves', 'Nice to haves'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} htmlFor={`${ids}-${key}`} className="block">
                  <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
                  <textarea
                    id={`${ids}-${key}`}
                    rows={4}
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs text-ink-2">One per line.</span>
                </label>
              ))}
            </div>

            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[44px] rounded border border-line-strong bg-card px-4 py-2 text-sm text-ink-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="min-h-[44px] rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
