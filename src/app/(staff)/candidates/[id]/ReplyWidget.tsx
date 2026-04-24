'use client'

import Link from 'next/link'
import { useState } from 'react'

interface Option {
  id: string
  title: string
  tone: 'warm' | 'neutral' | 'closing'
  description: string
}

const TONE_STYLE: Record<string, string> = {
  warm: 'bg-teal-light text-teal-dark',
  neutral: 'bg-surface text-ink-2',
  closing: 'bg-danger-bg text-danger',
}

export function ReplyWidget({
  candidateId,
  candidateName,
  candidateEmail,
  roleId,
  stageApplicable,
  allOthers,
}: {
  candidateId: string
  candidateName: string
  candidateEmail: string
  roleId: string
  /** Templates that match the candidate's current stage, shown first. */
  stageApplicable: Option[]
  /** Rest of the catalogue. */
  allOthers: Option[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <section className="rounded-lg border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink">Email {candidateName.split(' ')[0] ?? candidateName}</h2>
          <p className="mt-0.5 text-xs text-ink-2">
            {candidateEmail ? `To: ${candidateEmail}` : 'No email on file; you can still draft and copy.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
        >
          {open ? 'Hide templates' : 'Pick a template'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {stageApplicable.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">
                Suggested for this stage
              </h3>
              <ul className="divide-y divide-line overflow-hidden rounded border border-line">
                {stageApplicable.map((t) => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    candidateId={candidateId}
                    roleId={roleId}
                  />
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">
              Full catalogue
            </h3>
            <ul className="divide-y divide-line overflow-hidden rounded border border-line">
              {allOthers.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  candidateId={candidateId}
                  roleId={roleId}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )

  function TemplateRow({
    template: t,
    candidateId,
    roleId,
  }: {
    template: Option
    candidateId: string
    roleId: string
  }) {
    const qs = new URLSearchParams({ candidateId })
    if (roleId) qs.set('roleId', roleId)
    return (
      <li>
        <Link
          href={`/emails/${t.id}?${qs.toString()}`}
          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-medium text-ink">{t.title}</span>
              <span
                className={
                  'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ' +
                  (TONE_STYLE[t.tone] ?? TONE_STYLE.neutral)
                }
              >
                {t.tone}
              </span>
            </span>
            <span className="block truncate text-xs text-ink-3">{t.description}</span>
          </span>
          <span className="shrink-0 text-xs font-medium text-navy">Compose →</span>
        </Link>
      </li>
    )
  }
}
