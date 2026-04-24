import Link from 'next/link'
import { requireRoles } from '@/lib/guards'
import { LETTER_TEMPLATES } from '@/lib/letterTemplates'

export const dynamic = 'force-dynamic'

export default async function LettersPage() {
  await requireRoles(['Admin', 'HR'])
  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Letters</h1>
        <p className="mt-1 text-sm text-ink-2">
          Pick a template, pick an employee, review the defaults, download the filled .docx.
          Every generation is written to the employee's audit log.
        </p>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {LETTER_TEMPLATES.map((t) => (
          <li key={t.id}>
            <Link
              href={`/letters/${t.id}`}
              className="flex items-start justify-between gap-4 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{t.title}</span>
                <span className="block text-xs text-ink-2">{t.description}</span>
                <span className="mt-1 block text-xs text-ink-3 tabular">
                  {t.id} · {t.variables.length} fields · audience: {t.audience}
                </span>
              </span>
              <span className="text-xs font-medium text-navy">Generate →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
