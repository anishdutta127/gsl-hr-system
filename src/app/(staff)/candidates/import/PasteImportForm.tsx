'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const SOURCES = ['Naukri', 'Referral', 'Educohire', 'Careerchoice', 'HRTeam', 'Application', 'CSS', 'Other']
const COMMON_PROGRAMMES = ['Academics', 'Sales', 'Ops', 'Marketing', 'STEAM']

export function PasteImportForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [source, setSource] = useState('HRTeam')
  const [programmes, setProgrammes] = useState<Set<string>>(new Set())
  const [resumeText, setResumeText] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleProgramme(p: string) {
    setProgrammes((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Name required.')
    setBusy(true)
    try {
      const res = await fetch('/api/candidates/import-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          source,
          programmes: Array.from(programmes),
          resumeText,
          notes: notes.trim(),
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Failed.' }))
        setError(b.message ?? 'Failed.')
        setBusy(false)
        return
      }
      const data = (await res.json()) as { candidateId: string }
      router.push(`/candidates/${data.candidateId}`)
      router.refresh()
    } catch {
      setError("We couldn't reach our server.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 grid max-w-4xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="Paste candidate form">
      <div className="space-y-3">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-ink">
            Full name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-ink">
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>
        <div>
          <label htmlFor="source" className="block text-sm font-medium text-ink">
            Source
          </label>
          <select
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="rounded border border-line bg-surface/30 p-3">
          <legend className="text-xs font-medium text-ink-2">Programme tags</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {COMMON_PROGRAMMES.map((p) => (
              <label key={p} className="inline-flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={programmes.has(p)}
                  onChange={() => toggleProgramme(p)}
                  className="h-4 w-4 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
                />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-ink">
            Notes
          </label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Where they came from, who referred, anything that won't surface from the resume text."
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>
      </div>

      <div className="flex flex-col">
        <label htmlFor="resumeText" className="block text-sm font-medium text-ink">
          Resume text
        </label>
        <p className="mt-0.5 text-xs text-ink-3">
          Paste plain text. Up to 8,000 characters are searchable on /candidates.
        </p>
        <textarea
          id="resumeText"
          rows={18}
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="Paste the resume here. This is what the search on /candidates hits and what the role-match scorer reads."
          className="mt-2 flex-1 min-h-[240px] rounded border border-line-strong bg-card px-3 py-2 font-mono text-xs text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />

        {error && (
          <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2.5 text-base font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy ? 'Creating…' : 'Create candidate'}
          </button>
          <span className="text-xs text-ink-3">
            Lands in the pool; not attached to any role yet. Add to a pipeline from /roles/[id]/match
            or the bulk action on /candidates.
          </span>
        </div>
      </div>
    </form>
  )
}
