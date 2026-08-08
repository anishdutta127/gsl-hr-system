import Link from 'next/link'
import { requireRoles } from '@/lib/guards'
import { loadCandidates } from '@/lib/data'
import { EMAIL_TEMPLATES, findEmailTemplateById } from '@/lib/emailTemplates'
import { formatDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

const TONE_STYLE: Record<string, string> = {
  warm: 'bg-teal-light text-teal-dark',
  neutral: 'bg-surface text-ink-2',
  closing: 'bg-danger-bg text-danger',
}

interface LogBatch {
  bucketKey: string
  timestamp: string
  templateId: string
  templateTitle: string
  sender: string
  recipientCount: number
  recipients: Array<{ id: string; name: string }>
}

/** Group consecutive email.sent audit entries within the same minute by
 * (sender, templateId) so a "Bulk-send 12 candidates" lands as one row, not 12. */
async function buildLog(): Promise<LogBatch[]> {
  const candidates = await loadCandidates()
  const buckets = new Map<string, LogBatch>()
  for (const c of candidates) {
    for (const entry of c.auditLog ?? []) {
      if (entry.action !== 'email.sent') continue
      const after = (entry.after ?? {}) as { templateId?: string; templateTitle?: string }
      const templateId = after.templateId ?? 'unknown'
      const templateTitle =
        after.templateTitle ?? findEmailTemplateById(templateId)?.title ?? templateId
      const minute = entry.timestamp.slice(0, 16) // YYYY-MM-DDTHH:MM
      const bucketKey = `${entry.user}|${templateId}|${minute}`
      const existing = buckets.get(bucketKey)
      if (existing) {
        existing.recipientCount += 1
        if (existing.recipients.length < 8) {
          existing.recipients.push({ id: c.id, name: c.name })
        }
      } else {
        buckets.set(bucketKey, {
          bucketKey,
          timestamp: entry.timestamp,
          templateId,
          templateTitle,
          sender: entry.user,
          recipientCount: 1,
          recipients: [{ id: c.id, name: c.name }],
        })
      }
    }
  }
  return [...buckets.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export default async function EmailsPage() {
  await requireRoles(['Admin', 'HR'])
  const log = await buildLog()
  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Emails</h1>
        <p className="mt-1 text-sm text-ink-2">
          Templates for composing, plus a chronological log of every bulk send recorded on the
          system. We log; HR sends through their own Outlook or Gmail.
        </p>
      </div>

      <section aria-labelledby="log-heading" className="mb-10">
        <h2 id="log-heading" className="mb-3 font-display text-lg text-ink">
          Recent log ({log.length})
        </h2>
        {log.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No bulk emails have been logged yet. Use Log bulk email on /candidates to start.
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {log.slice(0, 50).map((batch) => (
              <li key={batch.bucketKey} className="px-5 py-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{batch.templateTitle}</div>
                    <div className="mt-0.5 text-xs text-ink-2">
                      {batch.recipientCount} {batch.recipientCount === 1 ? 'recipient' : 'recipients'} ·
                      logged by {batch.sender}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {batch.recipients.map((r) => (
                        <Link
                          key={r.id}
                          href={`/candidates/${r.id}`}
                          className="inline-flex items-center rounded bg-surface px-2 py-0.5 text-xs text-ink-2 hover:text-navy"
                        >
                          {r.name}
                        </Link>
                      ))}
                      {batch.recipientCount > batch.recipients.length && (
                        <span className="inline-flex items-center text-xs text-ink-3">
                          +{batch.recipientCount - batch.recipients.length} more
                        </span>
                      )}
                    </div>
                  </div>
                  <time
                    dateTime={batch.timestamp}
                    className="shrink-0 text-xs text-ink-3 tabular"
                  >
                    {formatDate(batch.timestamp)}
                  </time>
                </div>
              </li>
            ))}
            {log.length > 50 && (
              <li className="px-5 py-2 text-xs text-ink-3">Showing the latest 50 of {log.length}.</li>
            )}
          </ul>
        )}
      </section>

      <section aria-labelledby="templates-heading">
        <h2 id="templates-heading" className="mb-3 font-display text-lg text-ink">
          Templates
        </h2>
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
      </section>
    </div>
  )
}
