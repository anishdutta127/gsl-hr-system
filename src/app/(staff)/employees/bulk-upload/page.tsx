import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { BulkUploadClient } from './BulkUploadClient'

export const dynamic = 'force-dynamic'

/**
 * HR bulk employee upload. Upload -> validate -> preview -> confirm. Server-side
 * parse + reconcile via the shared service. Admin + HR only; never creates
 * taxonomy, never deletes, never initiates exits.
 */
export default async function BulkUploadPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin' && session.role !== 'HR') redirect('/employees')

  return (
    <div className="container-page py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-3">
        <Link href="/employees" className="rounded hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
          Employees
        </Link>
        <span className="px-2" aria-hidden="true">/</span>
        <span className="text-ink-2">Bulk upload</span>
      </nav>
      <div className="mb-6 border-l-4 border-orange pl-4">
        <h1 className="font-display text-2xl text-ink">Bulk employee upload</h1>
        <p className="mt-1 text-sm text-ink-2">
          Add new employees and reactivate existing ones from a spreadsheet. Every upload shows a
          preview before anything is written. This never deletes anyone and never starts an exit -
          exits are handled per person in the exit cockpit.
        </p>
      </div>
      <BulkUploadClient />
    </div>
  )
}
