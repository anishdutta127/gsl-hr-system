import Link from 'next/link'
import { requireRoles } from '@/lib/guards'
import { EMAIL_TEMPLATES } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

const TONE_STYLE: Record<string, string> = {
  warm: 'bg-teal-light text-teal-dark',
  neutral: 'bg-surface text-ink-2',
  closing: 'bg-danger-bg text-danger',
}

export default async function EmailsPage() {
  await requireRoles(['Admin', 'HR'])
  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Email templates</h1>
        <p className="mt-1 text-sm text-ink-2">
          Pick a template, pick a candidate, edit the tokens, copy the body into your email client.
          Every send is logged on the candidate's audit trail.
        </p>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {EMAIL_TEMPLATES.map((t) => (
          <li key={t.id}>
            <Link
              href={`/emails/${t.id}`}
              className="flex items-start justify-between gap-4 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-ink">{t.title}</span>
                  <span
                    className={
                      'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ' +
                      (TONE_STYLE[t.tone] ?? TONE_STYLE.neutral)
                    }
                  >
                    {t.tone}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-2">{t.description}</span>
                <span className="mt-1 block text-xs text-ink-3 tabular">
                  {t.id} · {t.variables.length} fields
                  {t.stagesApplicable.length > 0 ? ` · stages: ${t.stagesApplicable.slice(0, 3).join(', ')}${t.stagesApplicable.length > 3 ? '…' : ''}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-navy">Compose →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
