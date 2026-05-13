'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface HodOption {
  id: string
  name: string
  email: string
}

interface Props {
  month: string
  monthLabel: string
  hods: HodOption[]
  companyName: string
  recruiterEmail: string
}

/**
 * Builds the mailto: URL for the monthly nomination request and logs a
 * NominationCycle on click. The actual email send is mailto: — HR sees
 * the draft in Outlook / their mail client and chooses when to fire.
 */
export function NominationRequestForm(props: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(
    new Set(props.hods.map((h) => h.id)),
  )
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedHods = props.hods.filter((h) => selected.has(h.id))

  const subject = `Nominations open: Employee Recognition for ${props.monthLabel}`
  const body = [
    `Hi team,`,
    '',
    `It is time to recognise an employee from your department for ${props.monthLabel}.`,
    '',
    `Please submit your nomination via the GSL HR system — open /recognition/nominate and pick the employee, category, and a short write-up that captures what they did.`,
    '',
    `Nominations are due by the 25th of the month.`,
    '',
    `Thanks,`,
    props.recruiterEmail,
    props.companyName,
  ].join('\n')

  async function send() {
    if (selectedHods.length === 0) {
      setError('Pick at least one HOD.')
      return
    }
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/recognition/nominations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            month: props.month,
            hodIds: selectedHods.map((h) => h.id),
          }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'Could not log the nomination cycle. Try again.')
          return
        }
        const mailto = buildMailto({
          to: selectedHods.map((h) => h.email),
          subject,
          body,
        })
        // Open the draft AFTER the audit log lands so the click is not lost.
        window.location.href = mailto
        setSuccess('Nomination request logged. The draft should open in your mail client.')
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="text-sm font-medium text-ink-2">HOD recipients ({selectedHods.length} selected)</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {props.hods.length === 0 && (
            <li className="text-ink-3">No active HODs found.</li>
          )}
          {props.hods.map((h) => (
            <li key={h.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`hod-${h.id}`}
                checked={selected.has(h.id)}
                onChange={() => toggle(h.id)}
                className="h-4 w-4 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
              />
              <label htmlFor={`hod-${h.id}`} className="cursor-pointer text-ink">
                {h.name} <span className="text-ink-3">({h.email})</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="text-sm font-medium text-ink-2">Draft preview</h2>
        <p className="mt-1 text-xs text-ink-3">
          Subject and body are baked into this page. To customise per-month, edit
          NominationRequestForm.tsx and ship the change.
        </p>
        <div className="mt-3 rounded border border-line bg-surface px-3 py-2 font-mono text-xs">
          <div>
            <span className="text-ink-3">Subject:</span> {subject}
          </div>
          <pre className="mt-2 whitespace-pre-wrap text-ink">{body}</pre>
        </div>
      </section>

      <button
        type="button"
        onClick={send}
        disabled={busy || selectedHods.length === 0}
        className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Logging…' : 'Open draft email in mail client'}
      </button>

      {error && (
        <div role="alert" className="rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded border border-success bg-success-bg px-3 py-2 text-sm text-success">
          {success}
        </div>
      )}
    </div>
  )
}

function buildMailto(args: {
  to: string[]
  subject: string
  body: string
}): string {
  const params = new URLSearchParams({
    subject: args.subject,
    body: args.body,
  })
  return `mailto:${args.to.map((e) => encodeURIComponent(e)).join(',')}?${params.toString()}`
}
