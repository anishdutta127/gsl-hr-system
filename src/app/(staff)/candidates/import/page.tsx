import Link from 'next/link'
import { requireRoles } from '@/lib/guards'
import { PasteImportForm } from './PasteImportForm'

export const dynamic = 'force-dynamic'

export default async function PasteImportPage() {
  await requireRoles(['Admin', 'HR'])
  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/candidates" className="hover:text-ink">
          Candidates
        </Link>{' '}
        / Quick import
      </div>
      <h1 className="font-display text-2xl text-ink">Quick import from paste</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        For the case where a resume lands in your inbox and you want it searchable in the pool
        immediately. Paste the resume text below; it becomes the candidate's searchableText so
        they show up on <Link href="/candidates" className="text-navy hover:underline">/candidates</Link> search
        and on role-match scoring. For batch intake (a zip of resumes), ask Anish to run
        <code className="mx-1 rounded bg-surface px-1 py-0.5">scripts/import_resumes.py</code>
        against a OneDrive folder.
      </p>
      <PasteImportForm />
    </div>
  )
}
